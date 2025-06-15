import { QueryableData } from "./idb";
import { ColumnDefinition } from "./ColumnDefinitionBuilder";

export type WhereCondition<T> = {
  [K in keyof T]?:
    | T[K]
    | {
        equals?: T[K];
        notEquals?: T[K];
        greaterThan?: T[K];
        greaterThanOrEqual?: T[K];
        lessThan?: T[K];
        lessThanOrEqual?: T[K];
        inArray?: T[K][];
        isBetween?: [T[K], T[K]];
        contains?: string;
        looseContains?: string;
      };
};

export type OrderByCondition<T> = {
  field: keyof T;
  direction: "asc" | "desc";
};

export class QueryBuilder<
  TStoreSchema extends Record<string, ColumnDefinition>,
  TData extends QueryableData<TStoreSchema>
> {
  private conditions: WhereCondition<TData>;
  private limitValue?: number;
  private orderByConditions: OrderByCondition<TData>[];

  constructor() {
    this.conditions = {};
    this.orderByConditions = [];
  }

  where(conditions: WhereCondition<TData>): this {
    this.conditions = { ...this.conditions, ...conditions };
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  orderBy(field: keyof TData, direction: "asc" | "desc" = "asc"): this {
    this.orderByConditions.push({ field, direction });
    return this;
  }

  matches(item: TData): boolean {
    return Object.entries(this.conditions).every(([key, condition]) => {
      const itemValue = item[key as keyof TData];

      if (
        typeof condition === "object" &&
        condition !== null &&
        !Array.isArray(condition) &&
        !(condition instanceof Date)
      ) {
        if ("equals" in condition) return itemValue === condition.equals;
        if ("notEquals" in condition) return itemValue !== condition.notEquals;

        if ("greaterThan" in condition) {
          return (
            itemValue !== null &&
            condition.greaterThan !== null &&
            itemValue > condition.greaterThan
          );
        }
        if ("greaterThanOrEqual" in condition) {
          return (
            itemValue !== null &&
            condition.greaterThanOrEqual !== null &&
            itemValue >= condition.greaterThanOrEqual
          );
        }
        if ("lessThan" in condition) {
          return (
            itemValue !== null && condition.lessThan !== null && itemValue < condition.lessThan
          );
        }
        if ("lessThanOrEqual" in condition) {
          return (
            itemValue !== null &&
            condition.lessThanOrEqual !== null &&
            itemValue <= condition.lessThanOrEqual
          );
        }
        if ("inArray" in condition && Array.isArray(condition.inArray)) {
          return condition.inArray.includes(itemValue);
        }
        if (
          "isBetween" in condition &&
          Array.isArray(condition.isBetween) &&
          condition.isBetween.length === 2
        ) {
          const [min, max] = condition.isBetween;
          return (
            itemValue !== null &&
            min !== null &&
            max !== null &&
            itemValue >= min &&
            itemValue <= max
          );
        }
        if (
          "contains" in condition &&
          typeof itemValue === "string" &&
          typeof condition.contains === "string"
        ) {
          return itemValue.includes(condition.contains);
        }
        if (
          "looseContains" in condition &&
          typeof itemValue === "string" &&
          typeof condition.looseContains === "string"
        ) {
          return itemValue.toLowerCase().includes(condition.looseContains.toLowerCase());
        }
        return false;
      } else {
        return itemValue === condition;
      }
    });
  }

  applyQuery(data: TData[]): TData[] {
    let result = data.filter((item) => this.matches(item));

    if (this.orderByConditions.length > 0) {
      result.sort((a, b) => {
        for (const { field, direction } of this.orderByConditions) {
          const valA = a[field];
          const valB = b[field];

          let comparison = 0;
          if (valA === null && valB !== null) {
            comparison = -1;
          } else if (valA !== null && valB === null) {
            comparison = 1;
          } else if (valA !== null && valB !== null) {
            if (valA < valB) {
              comparison = -1;
            } else if (valA > valB) {
              comparison = 1;
            }
          }

          if (direction === "desc") {
            comparison *= -1;
          }

          if (comparison !== 0) {
            return comparison;
          }
        }
        return 0;
      });
    }

    if (this.limitValue !== undefined && this.limitValue >= 0) {
      result = result.slice(0, this.limitValue);
    }

    return result;
  }

  getConditions(): WhereCondition<TData> {
    return this.conditions;
  }
}
