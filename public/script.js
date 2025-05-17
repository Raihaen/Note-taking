let currentPath = "";
let currentFilePath = "";

function fetchFiles(path = "") {
  fetch(`/files?path=${encodeURIComponent(path)}`)
    .then(res => res.json())
    .then(data => {
      currentPath = data.path;
      renderBreadcrumb(currentPath);
      renderFileList(data.contents);
      document.getElementById("file-content").innerHTML = "";
      document.getElementById("edit-btn").style.display = "none";
      document.getElementById("editor").style.display = "none";
      document.getElementById("file-content").style.display = "block";
    });
}

function renderBreadcrumb(path) {
  const container = document.getElementById("breadcrumb");
  const parts = path.split('/').filter(Boolean);
  let html = `<a href="#" onclick="fetchFiles('')">Home</a>`;
  let subPath = "";
  parts.forEach((part, idx) => {
    subPath += (subPath ? "/" : "") + part;
    html += ` / <a href="#" onclick="fetchFiles('${subPath}')">${part}</a>`;
  });
  container.innerHTML = html;
}

function renderFileList(contents) {
  const container = document.getElementById("file-list");
  container.innerHTML = "";
  contents.forEach(item => {
    const el = document.createElement("div");
    el.textContent = item.name;
    el.className = item.type;
    if (item.type === "folder") {
      el.onclick = () => fetchFiles(currentPath ? `${currentPath}/${item.name}` : item.name);
    } else {
      el.onclick = () => fetchFile(currentPath ? `${currentPath}/${item.name}` : item.name);
    }
    container.appendChild(el);
  });
}

function fetchFile(path) {
  fetch(`/file?path=${encodeURIComponent(path)}`)
    .then(res => res.text())
    .then(text => {
      document.getElementById("file-content").innerHTML = marked.parse(text);
      // Render math with KaTeX if available
      if (window.renderMathInElement) {
        renderMathInElement(document.getElementById("file-content"), {
          delimiters: [
            {left: "$$", right: "$$", display: true},
            {left: "$", right: "$", display: false}
          ]
        });
      }
      document.getElementById("edit-btn").style.display = "inline-block";
      document.getElementById("editor").style.display = "none";
      document.getElementById("file-content").style.display = "block";
      currentFilePath = path;
      document.getElementById("markdown-editor").value = text;
    });
}

document.getElementById("edit-btn").onclick = function() {
  document.getElementById("file-content").style.display = "none";
  document.getElementById("edit-btn").style.display = "none";
  document.getElementById("editor").style.display = "block";
};

document.getElementById("save-btn").onclick = function() {
  const newContent = document.getElementById("markdown-editor").value;
  fetch(`/file?path=${encodeURIComponent(currentFilePath)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: newContent
  })
  .then(res => {
    if (res.ok) {
      fetchFile(currentFilePath);
    } else {
      alert("Failed to save file!");
    }
  });
};

document.getElementById("cancel-btn").onclick = function() {
  document.getElementById("file-content").style.display = "block";
  document.getElementById("edit-btn").style.display = "inline-block";
  document.getElementById("editor").style.display = "none";
};

// Initial load
fetchFiles();
