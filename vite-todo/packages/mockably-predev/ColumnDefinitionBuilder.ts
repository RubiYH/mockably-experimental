export enum BaseColumnType {
  STRING = "STRING",
  NUMBER = "NUMBER",
  BOOLEAN = "BOOLEAN",
  DATE = "DATE",
  OBJECT = "OBJECT",
  ARRAY = "ARRAY",
}

export interface ColumnDefinition {
  _type: BaseColumnType;
  _isPrimaryKey?: boolean;
  _isAutoIncrement?: true;
  _isNullable?: true;
  _isUnique?: boolean;
  // _isIndexed?: boolean; // For non-unique indexes later
}

export abstract class BaseColumnBuilder<
  ThisBuilder extends BaseColumnBuilder<ThisBuilder, Def>, // Self-referential type for 'this'
  Def extends ColumnDefinition // The specific definition type being built
> {
  protected definition: Def;

  constructor(type: BaseColumnType) {
    this.definition = {
      _type: type,
    } as Def;
  }

  protected abstract self(): ThisBuilder; // To ensure 'this' is correctly typed in subclasses

  primaryKey(): ThisBuilder {
    this.definition._isPrimaryKey = true;
    if (
      this.definition._type !== BaseColumnType.NUMBER &&
      this.definition._type !== BaseColumnType.STRING
    ) {
      // IndexedDB primary keys can be string, number, date, or array of these.
      // Auto-increment is only for number.
      // For simplicity now, let's keep it simple.
      console.warn(
        "Primary keys are typically numbers or strings. Ensure type compatibility with IndexedDB."
      );
    }
    return this.self();
  }

  autoIncrement(): ThisBuilder {
    if (!this.definition._isPrimaryKey) {
      throw new Error("autoIncrement() must be called after primaryKey().");
    }
    if (this.definition._type !== BaseColumnType.NUMBER) {
      throw new Error("autoIncrement can only be applied to a NUMBER primary key.");
    }
    (this.definition as ColumnDefinition)._isAutoIncrement = true;
    return this.self();
  }

  nullable(isNullable: true | false = true): ThisBuilder {
    if (isNullable) {
      (this.definition as ColumnDefinition)._isNullable = true;
    } else {
      delete (this.definition as ColumnDefinition)._isNullable;
    }
    return this.self();
  }

  unique(isUnique = true): ThisBuilder {
    if (this.definition._isPrimaryKey && isUnique) {
      console.warn(
        "Primary keys are inherently unique. .unique() is redundant if also a primaryKey()."
      );
      if (!this.definition._isPrimaryKey) {
        this.definition._isUnique = isUnique;
      } else if (!isUnique) {
        delete this.definition._isUnique;
      }
    } else {
      this.definition._isUnique = isUnique;
    }
    return this.self();
  }

  /**
   * Internal method to get the fully constructed definition.
   * @internal
   */
  build() {
    return this.definition;
  }
}

// Specific Builder Implementations

export class StringBuilder extends BaseColumnBuilder<
  StringBuilder,
  ColumnDefinition & { _type: BaseColumnType.STRING }
> {
  constructor() {
    super(BaseColumnType.STRING);
  }
  protected self() {
    return this;
  }
  // Add string-specific methods like minLength, maxLength, pattern later if needed
}

export class NumberBuilder extends BaseColumnBuilder<
  NumberBuilder,
  ColumnDefinition & { _type: BaseColumnType.NUMBER }
> {
  constructor() {
    super(BaseColumnType.NUMBER);
  }
  protected self() {
    return this;
  }
  // Add number-specific methods like min, max later
}

export class BooleanBuilder extends BaseColumnBuilder<
  BooleanBuilder,
  ColumnDefinition & { _type: BaseColumnType.BOOLEAN }
> {
  constructor() {
    super(BaseColumnType.BOOLEAN);
  }
  protected self() {
    return this;
  }
}

export class DateBuilder extends BaseColumnBuilder<
  DateBuilder,
  ColumnDefinition & { _type: BaseColumnType.DATE }
> {
  constructor() {
    super(BaseColumnType.DATE);
  }
  protected self() {
    return this;
  }
}

export class ObjectBuilder extends BaseColumnBuilder<
  ObjectBuilder,
  ColumnDefinition & { _type: BaseColumnType.OBJECT }
> {
  constructor() {
    super(BaseColumnType.OBJECT);
  }
  protected self() {
    return this;
  }
}

export class ArrayBuilder extends BaseColumnBuilder<
  ArrayBuilder,
  ColumnDefinition & { _type: BaseColumnType.ARRAY }
> {
  constructor() {
    super(BaseColumnType.ARRAY);
  }
  protected self() {
    return this;
  }
}

// Define a union of all concrete builder types
type ConcreteColumnBuilder =
  | StringBuilder
  | NumberBuilder
  | BooleanBuilder
  | DateBuilder
  | ObjectBuilder
  | ArrayBuilder;

// Type for a schema definition object that uses these builders
export type FluentSchemaDefinition = Record<
  string,
  Record<string, ConcreteColumnBuilder> // Use the precise union type
>;

// Type to extract the actual ColumnDefinition from a FluentSchemaDefinition
export type ParsedSchema<T extends FluentSchemaDefinition> = {
  [KStore in keyof T]: {
    [KCol in keyof T[KStore]]: ReturnType<T[KStore][KCol]["build"]>;
  };
};
