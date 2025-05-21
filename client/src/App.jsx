import { useState } from "react";
import axios from "axios";

function App() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    setLoading(true);
    // Reset previous
    setQuery("");
    setResult(null);
    setAnswer("");

    try {
      const res = await axios.post("http://localhost:5000/api/chat", { message });
      // Backend returns { database, query, result, answer }
      console.log(res.data);
      setQuery(res.data.query);
      setResult(res.data.result);
      setAnswer(res.data.answer);
    } catch (err) {
      console.error(err);
      setAnswer("Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  // Render natural-language result if answer exists
  const renderAnswer = () => {
    if (!answer) return null;
    return (
      <p style={{ background: "#f0f0f0", padding: "1rem", borderRadius: "8px" }}>
        {answer}
      </p>
    );
  };

  // Render table for raw result if multiple rows
  const renderNaturalResult = () => {
    if (!result || typeof result !== "object") return null;

    if (Array.isArray(result) && result.length === 1) {
      const obj = result[0];
      const text = Object.entries(obj)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      return <p>{text}</p>;
    }

    if (Array.isArray(result) && result.length > 1) {
      return (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {Object.keys(result[0]).map((key) => (
                <th
                  key={key}
                  style={{
                    border: "1px solid #ccc",
                    padding: "8px",
                    backgroundColor: "#f9f9f9",
                    textAlign: "left",
                  }}
                >
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((value, j) => (
                  <td key={j} style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (typeof result === "string") {
      return <p style={{ color: "red" }}>{result}</p>;
    }

    return null;
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 600, margin: "auto" }}>
      <h1>💬 Gemini DB Chatbot</h1>
      <input
        type="text"
        value={message}
        placeholder="Hỏi về database..."
        onChange={(e) => setMessage(e.target.value)}
        style={{ width: "100%", padding: "10px", fontSize: "16px", marginBottom: "1rem" }}
      />
      <button
        onClick={sendMessage}
        disabled={loading}
        style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer" }}
      >
        {loading ? "Đang xử lý..." : "Gửi"}
      </button>

      {query && (
        <div style={{ marginTop: "2rem" }}>
          <h3>🧠 Truy vấn đã thực thi:</h3>
          <pre style={{ background: "#eee", padding: "1rem", borderRadius: "8px" }}>{query}</pre>
        </div>
      )}

      {answer && (
        <div style={{ marginTop: "1rem" }}>
          <h3>🗣️ Đáp án:</h3>
          {renderAnswer()}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "1rem" }}>
          <h3>📊 Kết quả dữ liệu:</h3>
          {renderNaturalResult()}
        </div>
      )}
    </div>
  );
}

export default App;
