import {
  BaseColumnType,
  ColumnDefinition,
  StringBuilder,
  NumberBuilder,
  BooleanBuilder,
  DateBuilder,
  ObjectBuilder,
  ArrayBuilder,
  ParsedSchema, // To type the processed schema
  FluentSchemaDefinition, // To type the input schema for open()
} from "./ColumnDefinitionBuilder";
import { QueryBuilder, WhereCondition } from "./QueryBuilder";

// --- Type Utilities based on ColumnDefinition ---

// Helper to get the TypeScript type from BaseColumnType
export type MapBaseType<BCT extends BaseColumnType> = BCT extends BaseColumnType.STRING
  ? string
  : BCT extends BaseColumnType.NUMBER
  ? number
  : BCT extends BaseColumnType.BOOLEAN
  ? boolean
  : BCT extends BaseColumnType.DATE
  ? Date
  : BCT extends BaseColumnType.OBJECT
  ? object
  : BCT extends BaseColumnType.ARRAY
  ? unknown[]
  : unknown;

// Type for data to be INSERTED
export type MapInsertTypes<TStoreSchema extends Record<string, ColumnDefinition>> = {
  // The Pick utility type constructs a type by picking a set of properties.
  // We first get all keys of the schema, then exclude the ones that are either auto-increment or nullable.
  [K in keyof TStoreSchema as TStoreSchema[K]["_isAutoIncrement"] extends true
    ? never
    : TStoreSchema[K]["_isNullable"] extends true
    ? never
    : K]: MapBaseType<TStoreSchema[K]["_type"]>;
} & {
  // Then we create a partial type for the nullable fields.
  [K in keyof TStoreSchema as TStoreSchema[K]["_isAutoIncrement"] extends true
    ? never
    : TStoreSchema[K]["_isNullable"] extends true
    ? K
    : never]?: MapBaseType<TStoreSchema[K]["_type"]> | null;
};

// Type for data to be RETRIEVED/QUERIED
export type QueryableData<TStoreSchema extends Record<string, ColumnDefinition>> = {
  [K in keyof TStoreSchema]: TStoreSchema[K]["_isPrimaryKey"] extends true
    ? TStoreSchema[K]["_isAutoIncrement"] extends true
      ? number // Auto-incremented PK is always number
      : MapBaseType<TStoreSchema[K]["_type"]> // Non-auto-inc PK type
    : TStoreSchema[K]["_isNullable"] extends true // For non-PK fields
    ? MapBaseType<TStoreSchema[K]["_type"]> | null
    : MapBaseType<TStoreSchema[K]["_type"]>;
};

// Type for the object returned by the select() method, allowing chaining
export type SelectQueryBuilder<
  TStoreSchema extends Record<string, ColumnDefinition>,
  TData extends QueryableData<TStoreSchema> // This already represents a full row
> = {
  where: (conditions: WhereCondition<TData>) => SelectQueryBuilder<TStoreSchema, TData>;
  limit: (count: number) => SelectQueryBuilder<TStoreSchema, TData>;
  orderBy: (
    field: keyof TData,
    direction?: "asc" | "desc"
  ) => SelectQueryBuilder<TStoreSchema, TData>;
  then: <TResult1 = TData[], TResult2 = never>(
    onfulfilled?: ((value: TData[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
};

export type UpdateWhereStep<
  TStoreSchema extends Record<string, ColumnDefinition>,
  TData extends QueryableData<TStoreSchema>
> = {
  // For update, where conditions usually target PKs or indexed fields.
  // TData here represents the full row structure for querying.
  where: (conditions: WhereCondition<TData>) => Promise<void>;
};

export type UpdateSetStep<
  TStoreSchema extends Record<string, ColumnDefinition>,
  TData extends QueryableData<TStoreSchema>
> = {
  // Data to set should be partial of MapInsertTypes, but also allow PKs if not auto-inc, and must include updatedAt
  // For simplicity now, let's use Partial<QueryableData<TStoreSchema>> allowing any field.
  // A more precise type would be Partial<MapInsertTypes<TStoreSchema> & { updatedAt?: Date }>
  // excluding the PK if auto-incrementing.
  set: (dataToSet: Partial<QueryableData<TStoreSchema>>) => UpdateWhereStep<TStoreSchema, TData>;
};

// Generic type for the overall schema structure using ColumnDefinition
// e.g. { storeName1: { col1: ColumnDefinition, col2: ColumnDefinition }, storeName2: { ... } }
export type IDBSchema = Record<string, Record<string, ColumnDefinition>>;

export class IDB<TSchemaInternal extends IDBSchema> {
  // TSchemaInternal is the ParsedSchema
  // Static methods for fluent schema definition
  static string = () => new StringBuilder();
  static number = () => new NumberBuilder();
  static boolean = () => new BooleanBuilder();
  static date = () => new DateBuilder();
  static object = () => new ObjectBuilder();
  static array = () => new ArrayBuilder();

  private _db: IDBDatabase | undefined;
  private dbName: string;
  private version: number;
  private schemaDefinition: TSchemaInternal | undefined;

  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (reason?: DOMException | Error | null) => void;

  public tables: {
    [KStore in keyof TSchemaInternal]: {
      insert: (args: MapInsertTypes<TSchemaInternal[KStore]>) => Promise<IDBValidKey>;
      // display: () => Promise<QueryableData<TSchemaInternal[KStore]>[]>; // Keep or remove based on select()
      delete: () => {
        where: (
          conditions: WhereCondition<QueryableData<TSchemaInternal[KStore]>>
        ) => Promise<void>;
        then: <TResult1 = void, TResult2 = never>(
          onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | undefined | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null
        ) => Promise<TResult1 | TResult2>;
      };
      select: () => SelectQueryBuilder<
        TSchemaInternal[KStore],
        QueryableData<TSchemaInternal[KStore]>
      >;
      update: () => UpdateSetStep<TSchemaInternal[KStore], QueryableData<TSchemaInternal[KStore]>>;
      // Add a raw getAll for convenience if needed, similar to old display
      getAll: () => Promise<QueryableData<TSchemaInternal[KStore]>[]>;
    };
  } = {} as typeof this.tables;

  constructor(dbName: string, version: number) {
    this.dbName = dbName;
    this.version = version;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // DB is not opened here anymore
  }

  // Method to open the database and set up the schema
  public async open<TFluentSchema extends FluentSchemaDefinition>(
    fluentSchema: TFluentSchema
  ): Promise<void> {
    // 1. Parse the fluent schema into ColumnDefinition objects
    const parsedSchema = Object.fromEntries(
      Object.entries(fluentSchema).map(([storeName, columns]) => [
        storeName,
        Object.fromEntries(
          Object.entries(columns).map(([colName, builder]) => [
            colName,
            builder.build(), // Call build() on each builder
          ])
        ),
      ])
    ) as ParsedSchema<TFluentSchema>;

    this.schemaDefinition = parsedSchema as unknown as TSchemaInternal;

    const request = window.indexedDB.open(this.dbName, this.version);

    request.onupgradeneeded = (event) => {
      this._db = (event.target as IDBOpenDBRequest).result;
      try {
        Object.entries(this.schemaDefinition!).forEach(([storeName, columns]) => {
          this.createObjectStore(storeName, columns as Record<string, ColumnDefinition>);
        });
      } catch (error) {
        const err =
          error instanceof Error || error instanceof DOMException
            ? error
            : new Error(String(error || "Unknown error during onupgradeneeded"));
        this.rejectReady(err);
        throw err; // Propagate error to stop further processing
      }
    };

    request.onsuccess = (event) => {
      this._db = (event.target as IDBOpenDBRequest).result;
      this._db.onversionchange = () => {
        this._db?.close();
        alert("Database is outdated, please reload the page.");
        // Consider a more graceful way to handle this, e.g., an event or callback
        window.location.reload();
      };
      try {
        this.initializeTableMethods(this.schemaDefinition!);
        this.resolveReady();
      } catch (error) {
        const err =
          error instanceof Error || error instanceof DOMException
            ? error
            : new Error(String(error || "Unknown error during onsuccess"));
        this.rejectReady(err);
      }
    };

    request.onerror = (event) => {
      console.error("Database error:", (event.target as IDBOpenDBRequest).error);
      this.rejectReady((event.target as IDBOpenDBRequest).error);
    };

    return this.readyPromise;
  }

  private createObjectStore(storeName: string, columns: Record<string, ColumnDefinition>) {
    if (this._db?.objectStoreNames.contains(storeName)) {
      // Potentially allow schema evolution here in the future, for now, strict creation
      console.warn(`Object store '${storeName}' already exists. Skipping creation.`);
      // Or, if you want to throw an error for strict creation on first go:
      // throw new Error(`Object store '${storeName}' already exists.`);
      return; // Skip if store exists
    }

    let primaryKeyPath: string | undefined = undefined;
    let autoIncrementFlag = false;

    Object.entries(columns).forEach(([columnName, definition]) => {
      if (definition._isPrimaryKey) {
        if (primaryKeyPath) {
          throw new Error(
            `Multiple primary keys defined for store '${storeName}'. Only one is allowed.`
          );
        }
        primaryKeyPath = columnName;
        if (definition._isAutoIncrement) {
          if (definition._type !== BaseColumnType.NUMBER) {
            throw new Error(
              `Auto-increment primary key '${columnName}' in store '${storeName}' must be of type NUMBER.`
            );
          }
          autoIncrementFlag = true;
        }
      }
    });

    if (!primaryKeyPath) {
      throw new Error(
        `No primary key defined for store '${storeName}'. Use .primaryKey() on a column definition.`
      );
    }

    const store = this._db!.createObjectStore(storeName, {
      keyPath: primaryKeyPath,
      autoIncrement: autoIncrementFlag,
    });

    // Create indexes for unique fields (that are not the PK)
    Object.entries(columns).forEach(([columnName, definition]) => {
      if (definition._isUnique && columnName !== primaryKeyPath) {
        if (store.indexNames.contains(columnName + "_unique_idx")) {
          console.warn(
            `Index '${
              columnName + "_unique_idx"
            }' already exists on store '${storeName}'. Skipping creation.`
          );
        } else {
          store.createIndex(columnName + "_unique_idx", columnName, { unique: true });
        }
      }
      // Add non-unique indexes here later if .indexed() is implemented
    });
  }

  private initializeTableMethods(processedSchema: TSchemaInternal) {
    (Object.keys(processedSchema) as Array<keyof TSchemaInternal>).forEach((storeName) => {
      this.tables[storeName] = {
        getAll: () => this.getAllRecords(storeName),
        insert: (args) => this.insert(storeName, args),
        delete: () => this.createDeleteQuery(storeName, processedSchema[storeName]),
        select: () => this.createSelectQuery(storeName),
        update: () => this.createUpdateQuery(storeName, processedSchema[storeName]),
      };
    });
  }

  private transaction<TResult>(
    storeName: keyof TSchemaInternal,
    mode: IDBTransactionMode,
    task: (table: IDBObjectStore) => IDBRequest<TResult> | Promise<TResult>
  ): Promise<TResult> {
    return new Promise((resolve, reject) => {
      if (!this._db) {
        return reject(new Error("Database is not open. Call open() first."));
      }
      const transaction = this._db.transaction(storeName as string, mode);
      const table = transaction.objectStore(storeName as string);

      let request: IDBRequest<TResult> | undefined;
      try {
        const taskResult = task(table);
        if (taskResult instanceof IDBRequest) {
          request = taskResult;
        } else {
          // Handle if task itself is async and returns a Promise
          taskResult.then(resolve).catch(reject);
          return;
        }
      } catch (err) {
        return reject(err);
      }

      request.onsuccess = () => resolve(request!.result);
      request.onerror = () => reject(request!.error);

      transaction.onabort = () =>
        reject(
          transaction.error ||
            new DOMException("Transaction aborted by the user or system.", "AbortError")
        );
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private async getAllRecords<TStoreName extends keyof TSchemaInternal>(
    storeName: TStoreName
  ): Promise<QueryableData<TSchemaInternal[TStoreName]>[]> {
    return this.transaction(storeName, "readonly", (table) => table.getAll()) as Promise<
      QueryableData<TSchemaInternal[TStoreName]>[]
    >;
  }

  private async insert<TStoreName extends keyof TSchemaInternal>(
    storeName: TStoreName,
    args: MapInsertTypes<TSchemaInternal[TStoreName]>
  ): Promise<IDBValidKey> {
    return this.transaction(storeName, "readwrite", (table) => table.add(args));
  }

  private createDeleteQuery<TStoreName extends keyof TSchemaInternal>(
    storeName: TStoreName,
    storeSchema: TSchemaInternal[TStoreName]
  ): {
    where: (
      conditions: WhereCondition<QueryableData<TSchemaInternal[TStoreName]>>
    ) => Promise<void>;
    then: <TResult1 = void, TResult2 = never>(
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ) => Promise<TResult1 | TResult2>;
  } {
    const builder = new QueryBuilder<
      TSchemaInternal[TStoreName],
      QueryableData<TSchemaInternal[TStoreName]>
    >();

    return {
      where: (
        conditions: WhereCondition<QueryableData<TSchemaInternal[TStoreName]>>
      ): Promise<void> => {
        builder.where(conditions);
        return this.executeDelete(storeName, storeSchema, builder);
      },
      then: <TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null
      ): Promise<TResult1 | TResult2> => {
        return this.executeDelete(storeName, storeSchema, builder).then(onfulfilled, onrejected);
      },
    };
  }

  private async executeDelete<TStoreName extends keyof TSchemaInternal>(
    storeName: TStoreName,
    storeSchema: TSchemaInternal[TStoreName],
    builder: QueryBuilder<TSchemaInternal[TStoreName], QueryableData<TSchemaInternal[TStoreName]>>
  ): Promise<void> {
    const allRecords = await this.getAllRecords(storeName);
    const matchingRecords = builder.applyQuery(allRecords);

    const primaryKeyPath = this.getPrimaryKeyPath(storeSchema);
    if (!primaryKeyPath)
      throw new Error(`Primary key not found for store ${String(storeName)} during delete.`);

    const promises = matchingRecords.map((record) => {
      const key = (record as Record<string, unknown>)[primaryKeyPath];
      if (this.isValidKey(key)) {
        return this.transaction(storeName, "readwrite", (table) => table.delete(key));
      }
      return Promise.resolve();
    });
    await Promise.all(promises);
  }

  private getPrimaryKeyPath(storeSchema: Record<string, ColumnDefinition>): string | undefined {
    for (const [colName, def] of Object.entries(storeSchema)) {
      if (def._isPrimaryKey) return colName;
    }
    return undefined;
  }

  private createSelectQuery<TStoreName extends keyof TSchemaInternal>(
    storeName: TStoreName
  ): SelectQueryBuilder<TSchemaInternal[TStoreName], QueryableData<TSchemaInternal[TStoreName]>> {
    const builder = new QueryBuilder<
      TSchemaInternal[TStoreName],
      QueryableData<TSchemaInternal[TStoreName]>
    >();

    const queryInterface: SelectQueryBuilder<
      TSchemaInternal[TStoreName],
      QueryableData<TSchemaInternal[TStoreName]>
    > = {
      where: (conditions) => {
        builder.where(conditions);
        return queryInterface; // Return the same object for chaining
      },
      limit: (count) => {
        builder.limit(count);
        return queryInterface;
      },
      orderBy: (field, direction) => {
        builder.orderBy(field, direction);
        return queryInterface;
      },
      then: async <TResult1 = QueryableData<TSchemaInternal[TStoreName]>[], TResult2 = never>(
        onfulfilled?:
          | ((
              value: QueryableData<TSchemaInternal[TStoreName]>[]
            ) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> => {
        try {
          const allRecords = await this.getAllRecords(storeName);
          const result = builder.applyQuery(allRecords);
          return onfulfilled ? onfulfilled(result) : (result as TResult1);
        } catch (err) {
          if (onrejected) {
            return onrejected(err);
          }
          throw err;
        }
      },
    };
    return queryInterface;
  }

  private isValidKey(key: unknown): key is IDBValidKey {
    return (
      key !== undefined &&
      (typeof key === "string" ||
        typeof key === "number" ||
        key instanceof Date ||
        (Array.isArray(key) && key.every((k) => this.isValidKey(k))))
    );
  }

  private createUpdateQuery<TStoreName extends keyof TSchemaInternal>(
    storeName: TStoreName,
    storeSchema: TSchemaInternal[TStoreName]
  ): UpdateSetStep<TSchemaInternal[TStoreName], QueryableData<TSchemaInternal[TStoreName]>> {
    return {
      set: (dataToSet: Partial<QueryableData<TSchemaInternal[TStoreName]>>) => {
        return {
          where: async (
            conditions: WhereCondition<QueryableData<TSchemaInternal[TStoreName]>>
          ): Promise<void> => {
            const builder = new QueryBuilder<
              TSchemaInternal[TStoreName],
              QueryableData<TSchemaInternal[TStoreName]>
            >();
            builder.where(conditions);

            const allRecords = await this.getAllRecords(storeName);
            const matchingRecords = builder.applyQuery(allRecords);
            const primaryKeyPath = this.getPrimaryKeyPath(storeSchema);
            if (!primaryKeyPath)
              throw new Error(
                `Primary key not found for store ${String(storeName)} during update.`
              );

            const promises = matchingRecords.map((record) => {
              // Ensure primary key is not changed if it's part of dataToSet, unless explicitly allowed
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [primaryKeyPath]: _pk, ...safeDataToSet } = dataToSet as Record<
                string,
                unknown
              >;

              const updatedRecord = {
                ...record,
                ...safeDataToSet,
                ...(!("updatedAt" in dataToSet) ? { updatedAt: new Date() } : {}),
              };

              // IDB put will add if key doesn't exist, or update if it does.
              // This is fine for updating existing records.
              return this.transaction(storeName, "readwrite", (table) => table.put(updatedRecord));
            });
            await Promise.all(promises);
          },
        };
      },
    };
  }

  public isReady(): Promise<void> {
    if (!this._db && !this.readyPromise) {
      // If open() was never called
      return Promise.reject(
        new Error("Database connection not initiated. Call .open(schema) first.")
      );
    }
    return this.readyPromise;
  }
}
