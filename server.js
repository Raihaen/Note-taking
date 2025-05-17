const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const DOCS_DIR = path.join(__dirname, "docs");

app.use(express.static("public"));

// List folders and .md files in a given directory (not recursively)
function listDirContents(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() || entry.name.endsWith(".md"))
    .map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? "folder" : "file"
    }));
}

// Route to list contents of a directory (default: root)
app.get("/files", (req, res) => {
  const relPath = req.query.path || "";
  const absPath = path.join(DOCS_DIR, relPath);

  // Prevent path traversal
  if (!absPath.startsWith(DOCS_DIR)) return res.status(403).send("Forbidden");

  try {
    const contents = listDirContents(absPath);
    res.json({ path: relPath, contents });
  } catch (err) {
    res.status(404).send("Directory not found");
  }
});

// Route to get the content of a .md file
app.get("/file", (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).send("Missing file path");

  const absPath = path.join(DOCS_DIR, relPath);

  // Prevent path traversal
  if (!absPath.startsWith(DOCS_DIR)) return res.status(403).send("Forbidden");

  // Check if it's a file and ends with .md
  if (!absPath.endsWith(".md")) return res.status(400).send("Not a markdown file");

  fs.readFile(absPath, "utf8", (err, data) => {
    if (err) return res.status(404).send("File not found");
    res.send(data);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});


//// add for editing 

const bodyParser = require('body-parser');
app.use(bodyParser.text()); // To parse text/plain bodies

app.put("/file", (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).send("Missing file path");

  const absPath = path.join(DOCS_DIR, relPath);
  if (!absPath.startsWith(DOCS_DIR)) return res.status(403).send("Forbidden");

  fs.writeFile(absPath, req.body, "utf8", err => {
    if (err) return res.status(500).send("Failed to save file");
    res.send("File saved");
  });
});
