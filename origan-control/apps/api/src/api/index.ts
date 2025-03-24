import Elysia from "elysia";

const api = new Elysia({ prefix: "/api" }).get("/hello", () => ({
  message: "World",
}));

export default api;
