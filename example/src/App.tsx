import { useEffect, useState } from "react";

function App() {
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/hello")
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        if (data) {
          setSuccess(true);
        }
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
      });
  }, []);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <h1>🌱 Origan</h1>
      <img src="/origan.png" alt="Origan" width={200} />
      {success && (
        <div style={{ marginTop: "20px" }}>
          <h2>Success!</h2>
          <p>Data fetched successfully from the server.</p>
        </div>
      )}
    </div>
  );
}

export default App;
