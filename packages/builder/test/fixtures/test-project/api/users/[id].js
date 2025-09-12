export default async function handler(request) {
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  return new Response(JSON.stringify({ id, name: `User ${id}` }), {
    headers: { "Content-Type": "application/json" },
  });
}
