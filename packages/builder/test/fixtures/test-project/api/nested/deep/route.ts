export default async function handler(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ path: "nested/deep/route" }), {
    headers: { "Content-Type": "application/json" },
  });
}
