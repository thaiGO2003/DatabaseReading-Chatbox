Mini Chat Box Project
Overview
The Mini Chat Box is a lightweight chat application that integrates with a database by using Gemini API (MySQL or MongoDB) to store and retrieve conversation data. It uses a simple natural language processing (NLP) approach to generate human-like responses based on predefined patterns or data stored in the database. The project is built using Node.js for the backend, with a basic HTML/CSS/JavaScript frontend for user interaction.
Features

Database Integration: Supports MySQL or MongoDB for storing chat history and response patterns.
Natural Responses: Generates responses based on predefined rules or data fetched from the database.
Real-time Chat: Users can interact with the chat box in real-time via a web interface.
Extensible: Easily customizable to add more complex NLP or additional database support.

Prerequisites

Node.js (v16 or higher)
MySQL (v8.0 or higher) or MongoDB (v4.4 or higher)
npm (Node Package Manager)

Installation

Clone the Repository:
git clone https://github.com/yourusername/mini-chat-box.git
cd mini-chat-box


Install Dependencies for frontend and backend:
npm install

Environment Variables:

Create a .env file in the server directory.
Add the following:DB_TYPE=mysql # or mongodb
PORT=5000
GEMINI_API_KEY=
DB_HOST=localhost
DB_USER=
DB_PASSWORD=
DB_NAME=

MONGODB_NAME=
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=admin




Start the Application:
npm start at backend then npm run dev at frontend

The backend application will run on http://localhost:5000.

Open your browser and navigate to http://localhost:3000.

Start typing in the chat box, and the system will respond based on data stored in the database or predefined rules.
To add new response patterns, update the database with new entries in the responses table (MySQL) or responses collection (MongoDB).

Database Schema

MySQL:CREATE TABLE responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    keyword VARCHAR(255) NOT NULL,
    response TEXT NOT NULL
);


MongoDB:{
    keyword: String,
    response: String
}



Example

User Input: "Hello"
Database Entry:
Keyword: "hello"
Response: "Hi there! How can I assist you today?"


Chat Box Output: "Hi there! How can I assist you today?"

Contributing
Contributions are welcome! Please fork the repository, create a new branch, and submit a pull request with your changes.
License
This project is licensed under the MIT License.
