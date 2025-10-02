const convertBtn = document.getElementById("convertBtn");
const wordFile = document.getElementById("wordFile");
const spinner = document.getElementById("spinner");
const result = document.getElementById("result");

convertBtn.addEventListener("click", () => {
  const file = wordFile.files[0];

  if (!file) {
    result.innerHTML = "<p style='color:red;'>Please select a Word file first!</p>";
    return;
  }

  // Show spinner
  spinner.style.display = "block";
  result.innerHTML = "";

  // Simulate conversion delay
  setTimeout(() => {
    spinner.style.display = "none";

    // Fake download link for demonstration
    const pdfFileName = file.name.replace(/\.[^/.]+$/, "") + ".pdf";
    const link = document.createElement("a");
    link.href = "#"; // Replace with actual PDF generation backend if needed
    link.download = pdfFileName;
    link.textContent = `Download ${pdfFileName}`;
    link.style.display = "inline-block";
    link.style.marginTop = "15px";
    link.style.color = "#4a63e7";
    link.style.fontWeight = "600";
    link.style.textDecoration = "none";
    link.onmouseover = () => link.style.color = "#ff7e5f";
    link.onmouseout = () => link.style.color = "#4a63e7";

    result.appendChild(link);
  }, 1500);
});

// Optional: Animate file input focus
wordFile.addEventListener("focus", () => {
  wordFile.style.borderColor = "#4a63e7";
});

wordFile.addEventListener("blur", () => {
  wordFile.style.borderColor = "#ccc";
});
