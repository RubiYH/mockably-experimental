import { IDB } from "../packages/mockably-predev/idb";


export const appSchema = {
  todos: {
    id: IDB.number().primaryKey().autoIncrement(),
    title: IDB.string().nullable(false),
    content: IDB.string().nullable(true),
    completed: IDB.boolean().nullable(false).unique(false),
    createdAt: IDB.date().nullable(false),
    updatedAt: IDB.date().nullable(true),
  },
} as const;
