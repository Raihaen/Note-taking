const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 5000;

// Get GitHub token from environment variable
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

app.use(express.static("public"));
app.use(express.json());

// Parse GitHub URL to extract owner, repo, and path
function parseGitHubLink(url) {
    try {
        const urlObj = new URL(url);
        if (!urlObj.hostname.includes('github.com')) {
            return null;
        }
        
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        
        const owner = parts[0];
        const repo = parts[1];
        let path = "";
        
        if (parts.length > 2) {
            if (parts[2] === 'tree' || parts[2] === 'blob') {
                if (parts.length > 4) {
                    path = parts.slice(4).join('/');
                }
            } else {
                path = parts.slice(2).join('/');
            }
        }
        
        return { owner, repo, path };
    } catch (error) {
        return null;
    }
}

// Get repository contents from GitHub API
async function getRepoContents(owner, repo, path = "") {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitHub-Browser-App'
        };
        
        if (GITHUB_TOKEN) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }
        
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            console.error(`GitHub API error: ${response.status}`);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching repo contents:', error);
        return null;
    }
}

// Update file in GitHub repository
async function updateGitHubFile(owner, repo, path, content, sha, commitMessage) {
    if (!GITHUB_TOKEN) {
        throw new Error("GitHub token not configured");
    }
    
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'GitHub-Browser-App'
            },
            body: JSON.stringify({
                message: commitMessage,
                content: Buffer.from(content).toString('base64'),
                sha: sha
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating file:', error);
        throw error;
    }
}

// Store current repository info
let currentRepo = { owner: '', repo: '' };

// Route to set repository from GitHub URL
app.get("/set-repo", async (req, res) => {
    const githubUrl = req.query.url;
    
    if (!githubUrl) {
        return res.status(400).json({ error: "Missing GitHub URL" });
    }
    
    const parsed = parseGitHubLink(githubUrl);
    if (!parsed) {
        return res.status(400).json({ error: "Invalid GitHub URL" });
    }
    
    currentRepo = { owner: parsed.owner, repo: parsed.repo };
    res.json({ 
        message: "Repository set successfully", 
        owner: parsed.owner, 
        repo: parsed.repo,
        hasToken: !!GITHUB_TOKEN,
        tokenConfigured: !!GITHUB_TOKEN
    });
});

// Route to list contents of a directory
app.get("/files", async (req, res) => {
    if (!currentRepo.owner || !currentRepo.repo) {
        return res.status(400).json({ error: "No repository set" });
    }
    
    const relPath = req.query.path || "";
    const contents = await getRepoContents(currentRepo.owner, currentRepo.repo, relPath);
    
    if (!contents) {
        return res.status(404).json({ error: "Directory not found" });
    }
    
    // Filter and format contents
    const formattedContents = Array.isArray(contents) 
        ? contents.map(item => ({
            name: item.name,
            type: item.type === 'dir' ? 'folder' : 'file',
            path: item.path
          }))
        : [];
    
    res.json({ 
        path: relPath, 
        contents: formattedContents,
        canEdit: !!GITHUB_TOKEN
    });
});

// Route to get file content
app.get("/file", async (req, res) => {
    if (!currentRepo.owner || !currentRepo.repo) {
        return res.status(400).json({ error: "No repository set" });
    }
    
    const relPath = req.query.path;
    if (!relPath) {
        return res.status(400).send("Missing file path");
    }
    
    try {
        const fileData = await getRepoContents(currentRepo.owner, currentRepo.repo, relPath);
        
        if (!fileData || fileData.type !== 'file') {
            return res.status(404).send("File not found");
        }
        
        // Decode base64 content and send with metadata
        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        res.json({
            content: content,
            sha: fileData.sha,
            canEdit: !!GITHUB_TOKEN
        });
    } catch (error) {
        res.status(500).send("Error fetching file");
    }
});

// Route to update file in GitHub repository
app.put("/file", async (req, res) => {
    if (!currentRepo.owner || !currentRepo.repo) {
        return res.status(400).json({ error: "No repository set" });
    }
    
    if (!GITHUB_TOKEN) {
        return res.status(401).json({ error: "GitHub token not configured" });
    }
    
    const { path, content, sha, commitMessage } = req.body;
    
    if (!path || !content || !sha) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    try {
        const result = await updateGitHubFile(
            currentRepo.owner, 
            currentRepo.repo, 
            path, 
            content, 
            sha, 
            commitMessage || `Update ${path}`
        );
        
        res.json({ message: "File updated successfully", commit: result.commit });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to create a new file in GitHub repository
app.post("/file", async (req, res) => {
    if (!currentRepo.owner || !currentRepo.repo) {
        return res.status(400).json({ error: "No repository set" });
    }
    
    if (!GITHUB_TOKEN) {
        return res.status(401).json({ error: "GitHub token not configured" });
    }
    
    const { path, content, commitMessage } = req.body;
    
    if (!path) {
        return res.status(400).json({ error: "Missing file path" });
    }
    
    try {
        const url = `https://api.github.com/repos/${currentRepo.owner}/${currentRepo.repo}/contents/${path}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'GitHub-Browser-App'
            },
            body: JSON.stringify({
                message: commitMessage || `Create ${path}`,
                content: Buffer.from(content || '').toString('base64')
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        res.json({ message: "File created successfully", commit: result.commit });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to create a new folder (by creating a .gitkeep file inside it)
app.post("/folder", async (req, res) => {
    if (!currentRepo.owner || !currentRepo.repo) {
        return res.status(400).json({ error: "No repository set" });
    }
    
    if (!GITHUB_TOKEN) {
        return res.status(401).json({ error: "GitHub token not configured" });
    }
    
    const { path, commitMessage } = req.body;
    
    if (!path) {
        return res.status(400).json({ error: "Missing folder path" });
    }
    
    try {
        // GitHub doesn't have folders, so we create a .gitkeep file inside the folder
        const gitkeepPath = `${path}/.gitkeep`;
        const url = `https://api.github.com/repos/${currentRepo.owner}/${currentRepo.repo}/contents/${gitkeepPath}`;
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'GitHub-Browser-App'
            },
            body: JSON.stringify({
                message: commitMessage || `Create folder ${path}`,
                content: Buffer.from('').toString('base64') // Empty .gitkeep file
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        res.json({ message: "Folder created successfully", commit: result.commit });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to check token status
app.get("/token-status", (req, res) => {
    res.json({
        configured: !!GITHUB_TOKEN,
        message: GITHUB_TOKEN ? "Token configured" : "No token configured"
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    if (GITHUB_TOKEN) {
        console.log("✅ GitHub token configured - editing enabled");
    } else {
        console.log("⚠️ No GitHub token configured - read-only mode");
        console.log("💡 Set GITHUB_TOKEN environment variable to enable editing");
    }
});
