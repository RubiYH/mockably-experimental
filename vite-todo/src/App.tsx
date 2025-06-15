import { useEffect, useState, useCallback } from "react";
import "./App.css";
import { useIDB } from "../packages/mockably-predev/useIDB";
import { appSchema } from "./schema";
import { QueryableData } from "../packages/mockably-predev/idb";
import { ParsedSchema } from "../packages/mockably-predev/ColumnDefinitionBuilder";

type TodosStoreSchema = ParsedSchema<typeof appSchema>["todos"];
type Todo = QueryableData<TodosStoreSchema>;

function App() {
  const { db, isDBInitialized, dbInitializationError } = useIDB<typeof appSchema>();

  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoContent, setNewTodoContent] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [errorForDataOps, setErrorForDataOps] = useState<string | null>(null);

  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const fetchTodos = useCallback(async () => {
    if (!db || !isDBInitialized) return;
    setIsDataLoading(true);
    setErrorForDataOps(null);
    try {
      const allTodos = await db.tables.todos.select().orderBy("createdAt", "desc");
      setTodos(allTodos);
    } catch (err) {
      console.error("Failed to fetch todos:", err);
      setErrorForDataOps(String(err));
      setTodos([]);
    } finally {
      setIsDataLoading(false);
    }
  }, [db, isDBInitialized]);

  useEffect(() => {
    if (isDBInitialized && db) {
      fetchTodos();
    }
  }, [db, isDBInitialized, fetchTodos]);

  const handleAddTodo = async () => {
    if (!newTodoTitle.trim() || !db || !isDBInitialized) return;
    setIsDataLoading(true);
    setErrorForDataOps(null);
    try {
      await db.tables.todos.insert({
        title: newTodoTitle,
        content: newTodoContent,
        completed: false,
        createdAt: new Date(),
        updatedAt: null,
      });
      setNewTodoTitle("");
      setNewTodoContent("");
      await fetchTodos();
    } catch (err) {
      console.error("Failed to add todo:", err);
      setErrorForDataOps(String(err));
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleToggleComplete = async (todo: Todo) => {
    if (!db || !isDBInitialized || editingTodo) return;
    setIsDataLoading(true);
    setErrorForDataOps(null);
    try {
      await db.tables.todos
        .update()
        .set({ completed: !todo.completed, updatedAt: new Date() })
        .where({ id: todo.id });
      await fetchTodos();
    } catch (err) {
      console.error("Failed to toggle todo:", err);
      setErrorForDataOps(String(err));
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleDeleteTodo = async (id: number) => {
    if (!db || !isDBInitialized || editingTodo) return;
    setIsDataLoading(true);
    setErrorForDataOps(null);
    try {
      await db.tables.todos.delete().where({ id: id });
      await fetchTodos();
    } catch (err) {
      console.error("Failed to delete todo:", err);
      setErrorForDataOps(String(err));
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleStartEdit = (todo: Todo) => {
    setEditingTodo(todo);
  };

  const handleCancelEdit = () => {
    setEditingTodo(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTodo || !db || !isDBInitialized) return;
    setIsDataLoading(true);
    setErrorForDataOps(null);
    try {
      await db.tables.todos
        .update()
        .set({
          title: (editingTodo.title ?? "").trim() || "Untitled Todo",
          content: editingTodo.content,
          updatedAt: new Date(),
        })
        .where({ id: editingTodo.id });
      setEditingTodo(null);
      await fetchTodos();
    } catch (err) {
      console.error("Failed to save todo:", err);
      setErrorForDataOps(String(err));
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editingTodo) return;
    const { name, value } = e.target;
    setEditingTodo({
      ...editingTodo,
      [name]: value,
    });
  };

  if (!isDBInitialized && !dbInitializationError) {
    return (
      <div className="App">
        <p>Initializing database...</p>
      </div>
    );
  }

  if (dbInitializationError) {
    return (
      <div className="App">
        <p style={{ color: "red" }}>Database Error: {String(dbInitializationError)}</p>
      </div>
    );
  }

  if (isDataLoading && !todos.length && !errorForDataOps && !editingTodo) {
    return (
      <div className="App">
        <p>Loading todos...</p>
      </div>
    );
  }

  return (
    <div className="App">
      <h1>My Todos</h1>
      {dbInitializationError && (
        <p style={{ color: "red" }}>DB Error: {String(dbInitializationError)}</p>
      )}

      <div className="todo-form">
        <input
          type="text"
          placeholder="Todo title..."
          value={newTodoTitle}
          onChange={(e) => setNewTodoTitle(e.target.value)}
          disabled={!isDBInitialized || isDataLoading || !!editingTodo}
        />
        <input
          type="text"
          placeholder="Todo content... (optional)"
          value={newTodoContent}
          onChange={(e) => setNewTodoContent(e.target.value)}
          disabled={!isDBInitialized || isDataLoading || !!editingTodo}
        />
        <button
          onClick={handleAddTodo}
          disabled={!isDBInitialized || isDataLoading || !!editingTodo}
        >
          Add Todo
        </button>
      </div>

      {isDataLoading && todos.length > 0 && !editingTodo && <p>Updating todos...</p>}
      {errorForDataOps && <p style={{ color: "red" }}>Error: {errorForDataOps}</p>}

      {!isDataLoading && !errorForDataOps && todos.length === 0 && isDBInitialized && (
        <p>No todos yet. Add one!</p>
      )}

      <ul className="todo-list">
        {todos.map((todo) => (
          <li
            key={todo.id as number}
            className={`${todo.completed ? "completed" : ""} ${
              editingTodo?.id === todo.id ? "editing" : ""
            }`}
          >
            {editingTodo?.id === todo.id ? (
              <div className="edit-form">
                <input
                  type="text"
                  name="title"
                  value={editingTodo!.title ?? ""}
                  onChange={handleEditInputChange}
                  autoFocus
                />
                <textarea
                  name="content"
                  value={editingTodo!.content || ""}
                  onChange={handleEditInputChange}
                  placeholder="Content..."
                />
                <div className="edit-actions">
                  <button onClick={handleSaveEdit} disabled={isDataLoading}>
                    Save
                  </button>
                  <button onClick={handleCancelEdit} disabled={isDataLoading} className="cancel">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="todo-text">
                  <h3>{todo.title}</h3>
                  <p>{todo.content}</p>
                  <small>
                    Created: {todo.createdAt ? new Date(todo.createdAt).toLocaleString() : "N/A"}
                  </small>
                  {todo.updatedAt && (
                    <small style={{ marginLeft: "10px" }}>
                      Updated: {new Date(todo.updatedAt).toLocaleString()}
                    </small>
                  )}
                </div>
                <div className="todo-actions">
                  <button
                    onClick={() => handleStartEdit(todo)}
                    disabled={isDataLoading || !!editingTodo}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleComplete(todo)}
                    disabled={isDataLoading || !!editingTodo}
                  >
                    {todo.completed ? "Mark Incomplete" : "Mark Complete"}
                  </button>
                  <button
                    onClick={() => handleDeleteTodo(todo.id as number)}
                    className="delete"
                    disabled={isDataLoading || !!editingTodo}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
