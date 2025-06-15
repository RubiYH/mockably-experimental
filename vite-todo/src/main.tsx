import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import IDBProvider from "../packages/mockably-predev/Provider.tsx";
import { appSchema } from "./schema.ts";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <IDBProvider name="todo" version={1} schema={appSchema}>
    <App />
  </IDBProvider>
);
