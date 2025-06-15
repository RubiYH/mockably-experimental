import { useContext } from "react";
import { IDBContext, IDBContextValue } from "./Provider";
import { FluentSchemaDefinition, ParsedSchema } from "./ColumnDefinitionBuilder";

export const useIDB = <S_Fluent extends FluentSchemaDefinition>() => {
  // The context type should ideally match ParsedSchema<S_Fluent>
  // We cast the context value here. This assumes IDBProvider was used with a compatible schema.
  const context = useContext(
    IDBContext as React.Context<IDBContextValue<ParsedSchema<S_Fluent>> | null>
  );
  if (!context) {
    throw new Error("useIDB must be used within an IDBProvider");
  }
  return context;
};
