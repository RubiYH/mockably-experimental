import { createContext, ReactNode, useState, useEffect } from "react";
import { IDB, IDBSchema } from "./idb"; // IDBSchema is Record<string, Record<string, ColumnDefinition>>
import { FluentSchemaDefinition, ParsedSchema } from "./ColumnDefinitionBuilder";

export interface IDBContextValue<S_Internal extends IDBSchema> {
  db: IDB<S_Internal> | null;
  isDBInitialized: boolean;
  dbInitializationError: DOMException | Error | null;
}

// Use IDBSchema instead of any for a more specific default for the context.
export const IDBContext = createContext<IDBContextValue<IDBSchema> | null>(null);

function IDBProvider<S_Fluent extends FluentSchemaDefinition>({
  // Generic for the fluent schema
  name,
  version,
  schema, // The fluent schema definition
  children,
}: {
  name: string;
  version: number;
  schema: S_Fluent;
  children: ReactNode;
}) {
  // The IDB instance type will be IDB<ParsedSchema<S_Fluent>>
  // We need to ensure TSchemaInternal in IDB class aligns with ParsedSchema<S_Fluent>
  const [dbInstance] = useState(() => new IDB<ParsedSchema<S_Fluent>>(name, version));
  const [isDBInitialized, setIsDBInitialized] = useState(false);
  const [dbInitializationError, setDbInitializationError] = useState<DOMException | Error | null>(
    null
  );

  useEffect(() => {
    if (dbInstance) {
      dbInstance
        .open(schema) // Call open with the fluent schema
        .then(() => {
          setIsDBInitialized(true);
          setDbInitializationError(null);
        })
        .catch((error: unknown) => {
          // Catch error as unknown for safe type checking
          console.error("IDBProvider: DB initialization failed", error);
          setIsDBInitialized(false);
          if (error instanceof DOMException) {
            // Check specific first
            setDbInitializationError(error);
          } else if (error instanceof Error) {
            // Then general Error
            setDbInitializationError(error);
          } else {
            setDbInitializationError(new Error("Unknown initialization error"));
          }
        });
    }
  }, [dbInstance, schema, name, version]); // name, version, schema are dependencies for re-init if they change

  return (
    // The actual dbInstance is IDB<ParsedSchema<S_Fluent>>.
    // The context expects IDBContextValue<IDBSchema> or IDBContextValue<ParsedSchema<S_Fluent>> (via useIDB cast).
    // Casting dbInstance to IDB<IDBSchema> here if needed, but its structure should be compatible.
    <IDBContext.Provider
      value={{ db: dbInstance as IDB<IDBSchema>, isDBInitialized, dbInitializationError }}
    >
      {children}
    </IDBContext.Provider>
  );
}

export default IDBProvider;
