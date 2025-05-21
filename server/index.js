const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");
const mysql = require("mysql2/promise");
const mongoose = require("mongoose");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const mongoUri = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_NAME}?authSource=admin`;

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ Đã kết nối MongoDB"))
  .catch((err) => console.error("❌ Lỗi kết nối MongoDB:", err.message));

// --- MySQL Connection Pool ---
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// --- Schema Description Loading ---
let combinedSchemaDescription = "";

async function loadSchemaDescription() {
  let mysqlSchema = "MySQL Schema:\n";
  let mongoSchema = "MongoDB Schema:\n";

  try {
    console.log("⏳ Loading MySQL schema...");
    const [tables] = await pool.query("SHOW TABLES");
    const tableNames = tables.map((t) => Object.values(t)[0]);

    for (const table of tableNames) {
      const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      const colDescriptions = columns
        .map((col) => `${col.Field} (${col.Type})`)
        .join(", ");
      mysqlSchema += `  Table "${table}": ${colDescriptions}\n`;
    }
    console.log("✅ MySQL schema loaded.");
  } catch (error) {
    console.error("❌ Error loading MySQL schema:", error.message);
    mysqlSchema += "  Error loading schema.\n";
  }

  try {
    console.log("⏳ Loading MongoDB schema...");
    if (mongoose.connection.readyState === 1) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      if (collections.length > 0) {
        mongoSchema += "  Collections:\n";
        for (const collection of collections) {
          mongoSchema += `    - ${collection.name}\n`;
        }
      } else {
        mongoSchema += "  No collections found.\n";
      }
      console.log("✅ MongoDB schema loaded.");
    } else {
      mongoSchema += "  MongoDB not connected.\n";
      console.warn("⚠️ MongoDB schema not loaded: Connection not ready.");
    }
  } catch (error) {
    console.error("❌ Error loading MongoDB schema:", error.message);
    mongoSchema += "  Error loading schema.\n";
  }

  combinedSchemaDescription = `${mysqlSchema}\n${mongoSchema}`;
  console.log("📋 Combined Schema loaded:\n", combinedSchemaDescription);
}

setTimeout(loadSchemaDescription, 5000);

// --- API Endpoint ---
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Missing 'message' in request body." });
  }

  if (!combinedSchemaDescription) {
    console.warn("⚠️ Schema description not loaded yet. Retrying load...");
    await loadSchemaDescription();
    if (!combinedSchemaDescription) {
      return res.status(503).json({ error: "Schema description is not available yet. Please try again later." });
    }
  }

  try {
    // STEP 1: Use Gemini to determine DB type and generate the query
    console.log(`[${new Date().toISOString()}] Received question: "${message}"`);
    const queryGenPrompt = `
Dưới đây là schema cơ sở dữ liệu kết hợp từ MySQL và MongoDB:

${combinedSchemaDescription}

Câu hỏi của người dùng: "${message}"

Nhiệm vụ:
1. Xác định xem câu hỏi này liên quan đến cơ sở dữ liệu 'mysql' hay 'mongodb'.
2. Nếu là 'mysql', hãy tạo câu lệnh SQL hợp lệ để trả lời câu hỏi.
3. Nếu là 'mongodb', hãy xác định tên collection có liên quan và tạo một chuỗi JSON hợp lệ đại diện cho một mảng các giai đoạn Aggregation Pipeline cho phương thức \`aggregate()\` của MongoDB.
   - Sử dụng các giai đoạn như $match, $sort, $limit, v.v. Ví dụ: "[{\"$match\": {\"price\": {\"$lt\": 10}}}, {\"$sort\": {\"price\": -1}}, {\"$limit\": 5}]".
   - Tên giai đoạn phải bắt đầu bằng '$' (như $match, không phải match).
   - Đảm bảo pipeline luôn bắt đầu bằng một giai đoạn $match (có thể là {} nếu không có bộ lọc cụ thể).
4. Trả về KẾT QUẢ CHỈ LÀ MỘT ĐỐI TƯỢNG JSON DUY NHẤT, không có giải thích hay định dạng markdown nào khác.
   - Nếu là MySQL, JSON phải có dạng: \`{"database": "mysql", "query": "SELECT ..."}\`
   - Nếu là MongoDB, JSON phải có dạng: \`{"database": "mongodb", "collection": "tên_collection", "query": "[{\"$match\": {...}}, ...]}"}\`

Ví dụ JSON cho MongoDB: \`{"database": "mongodb", "collection": "menus", "query": "[{\"$match\": {\"price\": {\"$lt\": 10}}}, {\"$sort\": {\"price\": -1}}, {\"$limit\": 5}]"}\`
Ví dụ JSON cho MySQL: \`{"database": "mysql", "query": "SELECT name FROM products WHERE category = 'Electronics'"}\`

JSON Output:`;

    console.log("⏳ Calling Gemini for query generation...");
    const queryGenRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ role: "user", parts: [{ text: queryGenPrompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Safely parse the Gemini response
    let queryInfo;
    try {
      const rawText = queryGenRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("Raw Gemini Query Gen Response:", rawText);
      const cleanedJsonString = rawText.replace(/```json|```/g, "").trim();
      queryInfo = JSON.parse(cleanedJsonString);
      console.log("Parsed Query Info:", queryInfo);

      if (!queryInfo || !queryInfo.database || !queryInfo.query) {
        throw new Error("Invalid JSON structure from Gemini.");
      }
      if (queryInfo.database === "mongodb" && !queryInfo.collection) {
        throw new Error("Missing 'collection' field for mongodb query.");
      }
    } catch (parseError) {
      console.error("❌ Error parsing Gemini query generation response:", parseError.message);
      console.error("Raw response was:", queryGenRes.data?.candidates?.[0]?.content?.parts?.[0]?.text);
      return res.status(500).json({ error: "Lỗi xử lý phản hồi từ AI để tạo truy vấn." });
    }

    // STEP 2: Execute the query against the appropriate database
    let results;
    let executedQuery = queryInfo.query;

    console.log(`⏳ Executing query on ${queryInfo.database}...`);
    if (queryInfo.database === "mysql") {
      executedQuery = queryInfo.query.replace(/`/g, '');
      console.log("SQL Query:", executedQuery);
      const [rows] = await pool.query(executedQuery);
      results = rows;
      console.log(`✅ MySQL query executed. Found ${results.length} rows.`);
    } else if (queryInfo.database === "mongodb") {
      const collectionName = queryInfo.collection;
      let pipeline;

      try {
        if (typeof queryInfo.query === 'string') {
          pipeline = JSON.parse(queryInfo.query);
        } else {
          throw new Error("Query from Gemini is not a string as expected.");
        }

        // Kiểm tra xem pipeline là một mảng
        if (!Array.isArray(pipeline)) {
          console.warn("⚠️ Gemini returned a non-array pipeline. Converting to array with $match.");
          pipeline = [{ $match: pipeline || {} }];
        }

        // Làm sạch pipeline: sửa hoặc loại bỏ các giai đoạn không hợp lệ
        pipeline = pipeline.map(stage => {
          const stageKeys = Object.keys(stage);
          if (stageKeys.length === 0) {
            console.warn("⚠️ Empty stage detected. Replacing with $match: {}.");
            return { $match: {} };
          }
          const stageName = stageKeys[0];
          // Sửa các giai đoạn thiếu '$' (như {match: {}} thành {$match: {}})
          if (!stageName.startsWith('$')) {
            console.warn(`⚠️ Invalid stage name '${stageName}'. Converting to '$match'.`);
            return { $match: stage[stageName] || {} };
          }
          return stage;
        });

        // Đảm bảo pipeline có ít nhất một giai đoạn $match
        if (!pipeline.some(stage => stage.$match)) {
          console.warn("⚠️ Pipeline does not include $match stage. Adding default $match: {}.");
          pipeline.unshift({ $match: {} });
        }

        // Phân tích câu hỏi để lấy số lượng giới hạn (nếu có)
        let limit = 0;
        const match = message.match(/hiển thị\s+(\d+)\s+thực đơn/i);
        if (match) {
          limit = parseInt(match[1], 10);
          // Thêm hoặc thay thế giai đoạn $limit
          const limitIndex = pipeline.findIndex(stage => stage.$limit);
          if (limitIndex >= 0) {
            pipeline[limitIndex] = { $limit: limit };
          } else {
            pipeline.push({ $limit: limit });
          }
        }

        // Kiểm tra xem có nên dùng find() hay aggregate()
        if (pipeline.length === 1 && pipeline[0].$match) {
          // Chỉ có $match -> dùng find()
          const filter = pipeline[0].$match || {};
          executedQuery = `db.collection('${collectionName}').find(${JSON.stringify(filter)})`;
          if (limit > 0) {
            executedQuery += `.limit(${limit})`;
          }
          console.log("MongoDB Find Query:", executedQuery);

          if (mongoose.connection.readyState !== 1) {
            console.error("❌ Cannot query MongoDB: Connection not ready.");
            return res.status(503).json({ error: "Kết nối MongoDB chưa sẵn sàng." });
          }

          const collection = mongoose.connection.db.collection(collectionName);
          let query = collection.find(filter);
          if (limit > 0) {
            query = query.limit(limit);
          }
          results = await query.toArray();
          console.log(`✅ MongoDB find executed on collection '${collectionName}'. Found ${results.length} documents.`);
        } else {
          // Có các giai đoạn khác -> dùng aggregate()
          executedQuery = `db.collection('${collectionName}').aggregate(${JSON.stringify(pipeline)})`;
          console.log("MongoDB Aggregation Pipeline:", executedQuery);

          if (mongoose.connection.readyState !== 1) {
            console.error("❌ Cannot query MongoDB: Connection not ready.");
            return res.status(503).json({ error: "Kết nối MongoDB chưa sẵn sàng." });
          }

          const collection = mongoose.connection.db.collection(collectionName);
          results = await collection.aggregate(pipeline).toArray();
          console.log(`✅ MongoDB aggregation executed on collection '${collectionName}'. Found ${results.length} documents.`);
        }
      } catch (mongoError) {
        console.error(`❌ Error executing MongoDB query on collection '${collectionName}':`, mongoError.message);
        return res.status(500).json({ error: `Lỗi khi thực thi truy vấn trên collection '${collectionName}' trong MongoDB.` });
      }
    } else {
      console.error(`❌ Unknown database type received from Gemini: ${queryInfo.database}`);
      return res.status(500).json({ error: "AI trả về loại cơ sở dữ liệu không xác định." });
    }

    // STEP 3: Generate natural language answer
    console.log("⏳ Calling Gemini for natural language answer...");
    const resultPrompt = `
Câu hỏi gốc của người dùng: "${message}"
Cơ sở dữ liệu được truy vấn: ${queryInfo.database}
Câu truy vấn đã thực thi: ${typeof executedQuery === 'string' ? executedQuery : JSON.stringify(executedQuery)}
Kết quả (${results.length} bản ghi): ${JSON.stringify(results)}

👉 Dựa vào câu hỏi và kết quả truy vấn, hãy viết một câu trả lời bằng tiếng Việt tự nhiên, thân thiện cho người dùng.
   - KHÔNG hiển thị dữ liệu dạng JSON thô.
   - KHÔNG đề cập đến cú pháp SQL hay MQL.
   - Trình bày kết quả một cách rõ ràng, dễ hiểu. Nếu không có kết quả, hãy thông báo như vậy.

Câu trả lời tự nhiên:`;

    const replyRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ role: "user", parts: [{ text: resultPrompt }] }],
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const answer =
      replyRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Xin lỗi, tôi không thể tạo câu trả lời tự nhiên vào lúc này.";

    console.log("✅ Natural language answer generated."+ " Answer: "+answer);
    res.json({
      database: queryInfo.database,
      query: executedQuery,
      result: results,
      answer: answer.trim(),
    });
  } catch (error) {
    console.error("❌ Error in /api/chat:", error.response ? JSON.stringify(error.response.data) : error.message);
    if (error.response && error.response.data && error.response.data.error) {
      console.error("Gemini API Error:", error.response.data.error.message);
      res.status(500).json({ error: `Lỗi từ AI: ${error.response.data.error.message}` });
    } else if (error.code) {
      res.status(500).json({ error: `Lỗi cơ sở dữ liệu: ${error.message} (Code: ${error.code})` });
    } else {
      res.status(500).json({ error: "Đã xảy ra lỗi không mong muốn trong quá trình xử lý yêu cầu." });
    }
  }
});

// --- Server Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`Connect to MongoDB at: ${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}`);
  console.log(`Connect to MySQL at: ${process.env.DB_HOST}`);
});