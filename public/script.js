let currentPath = "";
let currentFilePath = "";
let currentRepo = { owner: '', repo: '' };
let currentFileData = null;

// Set repository from GitHub URL
function setRepository() {
    const githubUrl = document.getElementById("github-url").value.trim();
    
    if (!githubUrl) {
        alert("Please enter a GitHub repository URL");
        return;
    }
    
    fetch(`/set-repo?url=${encodeURIComponent(githubUrl)}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                currentRepo = { owner: data.owner, repo: data.repo };
                document.getElementById("repo-info").textContent = `${data.owner}/${data.repo}`;
                document.getElementById("repo-container").style.display = "block";
                document.getElementById("contents-section").style.display = "block";
                
                if (data.tokenConfigured) {
                    document.getElementById("edit-status").textContent = "✅ Editing enabled";
                    document.getElementById("edit-status").style.color = "green";
                } else {
                    document.getElementById("edit-status").textContent = "⚠️ Read-only (no token configured)";
                    document.getElementById("edit-status").style.color = "orange";
                }
                
                updateCreationButtons();
                fetchFiles();
            }
        })
        .catch(err => {
            alert("Error setting repository: " + err.message);
        });
}

// Check token status on page load
function checkTokenStatus() {
    fetch('/token-status')
        .then(res => res.json())
        .then(data => {
            const statusElement = document.getElementById("token-status");
            if (data.configured) {
                statusElement.textContent = "✅ Token configured - editing available";
                statusElement.style.color = "green";
            } else {
                statusElement.textContent = "⚠️ No token configured - read-only mode";
                statusElement.style.color = "orange";
            }
        })
        .catch(err => {
            console.error("Error checking token status:", err);
        });
}

function fetchFiles(path = "") {
    if (!currentRepo.owner || !currentRepo.repo) {
        alert("No repository set");
        return;
    }
    
    fetch(`/files?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                return;
            }
            currentPath = data.path;
            renderBreadcrumb(currentPath);
            renderFileList(data.contents);
            
            // Hide file content when browsing
            document.getElementById("file-section").style.display = "none";
        })
        .catch(err => {
            alert("Error fetching files: " + err.message);
        });
}

function renderBreadcrumb(path) {
    const container = document.getElementById("breadcrumb");
    const parts = path.split('/').filter(Boolean);
    let html = `<span onclick="fetchFiles('')" style="cursor: pointer; color: blue;">📁 Root</span>`;
    let subPath = "";
    
    parts.forEach((part, idx) => {
        subPath += (subPath ? "/" : "") + part;
        const clickablePath = subPath;
        html += ` / <span onclick="fetchFiles('${clickablePath}')" style="cursor: pointer; color: blue;">${part}</span>`;
    });
    
    container.innerHTML = html;
}

function renderFileList(contents) {
    const container = document.getElementById("file-list");
    container.innerHTML = "";
    
    contents.forEach(item => {
        const el = document.createElement("div");
        el.className = `file-item ${item.type}`;
        el.innerHTML = `${item.type === 'folder' ? '📁' : '📄'} ${item.name}`;
        
        if (item.type === "folder") {
            el.onclick = () => fetchFiles(item.path);
        } else {
            el.onclick = () => fetchFile(item.path, item.name);
        }
        
        container.appendChild(el);
    });
}

function fetchFile(path, fileName) {
    fetch(`/file?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(data => {
            currentFilePath = path;
            currentFileData = data;
            
            // Show file section
            document.getElementById("file-section").style.display = "block";
            document.getElementById("current-file-name").textContent = fileName;
            
            // Check if it's a markdown file
            if (path.endsWith('.md')) {
                document.getElementById("file-content").innerHTML = marked.parse(data.content);
                
                // Render math with KaTeX if available
                if (window.renderMathInElement) {
                    renderMathInElement(document.getElementById("file-content"), {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false}
                        ]
                    });
                }
            } else {
                // For non-markdown files, show as code
                document.getElementById("file-content").innerHTML = `<pre><code>${data.content}</code></pre>`;
            }
            
            // Show edit button if token is configured
            if (data.canEdit) {
                document.getElementById("edit-btn").style.display = "inline-block";
                document.getElementById("markdown-editor").value = data.content;
            } else {
                document.getElementById("edit-btn").style.display = "none";
            }
            
            document.getElementById("editor").style.display = "none";
            document.getElementById("file-content").style.display = "block";
            
            // Scroll to file section
            document.getElementById("file-section").scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            alert("Error fetching file: " + err.message);
        });
}

// Edit functionality
document.getElementById("edit-btn").onclick = function() {
    if (!currentFileData || !currentFileData.canEdit) {
        alert("Editing not available");
        return;
    }
    
    document.getElementById("file-content").style.display = "none";
    document.getElementById("edit-btn").style.display = "none";
    document.getElementById("editor").style.display = "block";
};

document.getElementById("save-btn").onclick = function() {
    if (!currentFileData || !currentFileData.sha) {
        alert("Cannot save: missing file data");
        return;
    }
    
    const newContent = document.getElementById("markdown-editor").value;
    const commitMessage = document.getElementById("commit-message").value || `Update ${currentFilePath}`;
    
    fetch('/file', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            path: currentFilePath,
            content: newContent,
            sha: currentFileData.sha,
            commitMessage: commitMessage
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert("Failed to save: " + data.error);
        } else {
            alert("File saved successfully!");
            // Refresh the file to get new SHA
            const fileName = currentFilePath.split('/').pop();
            fetchFile(currentFilePath, fileName);
        }
    })
    .catch(err => {
        alert("Error saving file: " + err.message);
    });
};

document.getElementById("cancel-btn").onclick = function() {
    document.getElementById("file-content").style.display = "block";
    document.getElementById("edit-btn").style.display = "inline-block";
    document.getElementById("editor").style.display = "none";
    
    // Reset the editor content
    if (currentFileData) {
        document.getElementById("markdown-editor").value = currentFileData.content;
    }
};

// Create new file function
function createNewFile() {
    if (!currentRepo.owner || !currentRepo.repo) {
        alert("No repository set");
        return;
    }
    
    const fileName = prompt("Enter new file name (e.g., 'README.md' or 'docs/guide.md'):");
    if (!fileName) return;
    
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    const content = prompt("Enter initial content (optional):") || '';
    const commitMessage = prompt("Enter commit message (optional):") || `Create ${fileName}`;
    
    fetch('/file', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            path: filePath,
            content: content,
            commitMessage: commitMessage
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert("Failed to create file: " + data.error);
        } else {
            alert("File created successfully!");
            fetchFiles(currentPath); // Refresh current directory
        }
    })
    .catch(err => {
        alert("Error creating file: " + err.message);
    });
}

// Create new folder function
function createNewFolder() {
    if (!currentRepo.owner || !currentRepo.repo) {
        alert("No repository set");
        return;
    }
    
    const folderName = prompt("Enter new folder name:");
    if (!folderName) return;
    
    const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    const commitMessage = prompt("Enter commit message (optional):") || `Create folder ${folderName}`;
    
    fetch('/folder', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            path: folderPath,
            commitMessage: commitMessage
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert("Failed to create folder: " + data.error);
        } else {
            alert("Folder created successfully!");
            fetchFiles(currentPath); // Refresh current directory
        }
    })
    .catch(err => {
        alert("Error creating folder: " + err.message);
    });
}

// Show/hide creation buttons based on token status
function updateCreationButtons() {
    const hasToken = document.getElementById("edit-status").textContent.includes("✅");
    const createButtons = document.getElementById("creation-buttons");
    
    if (hasToken) {
        createButtons.style.display = "flex";
    } else {
        createButtons.style.display = "none";
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById("repo-container").style.display = "none";
    document.getElementById("contents-section").style.display = "none";
    document.getElementById("file-section").style.display = "none";
    checkTokenStatus();
});
