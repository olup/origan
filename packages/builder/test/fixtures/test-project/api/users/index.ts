interface User {
  id: string;
  name: string;
}

export default async function handler(_request: Request): Promise<Response> {
  const users: User[] = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ];

  return new Response(JSON.stringify(users), {
    headers: { "Content-Type": "application/json" },
  });
}
