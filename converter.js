// Exported function to handle the Word-to-PDF process
export function handleConversion() {
  const convertBtn = document.getElementById("convertBtn");
  const wordFile = document.getElementById("wordFile");
  const spinner = document.getElementById("spinner");
  const result = document.getElementById("result");

  if (!convertBtn || !wordFile || !spinner || !result) {
    console.warn("Converter elements not found on this page.");
    return;
  }

  // Click event for Convert button
  convertBtn.addEventListener("click", () => {
    const file = wordFile.files[0];

    if (!file) {
      result.innerHTML = "<p style='color:red; font-weight:600;'>⚠ Please select a Word file first!</p>";
      return;
    }

    // Show spinner and clear old results
    spinner.style.display = "block";
    result.innerHTML = "";

    // Simulate conversion delay (2s)
    setTimeout(() => {
      spinner.style.display = "none";

      // Generate fake download link
      const pdfFileName = file.name.replace(/\.[^/.]+$/, "") + ".pdf";
      const link = document.createElement("a");
      link.href = "#"; // Placeholder (later this will link to actual PDF)
      link.download = pdfFileName;
      link.textContent = `⬇ Download ${pdfFileName}`;
      link.classList.add("download-link");

      result.appendChild(link);
    }, 2000);
  });

  // Focus + blur visual feedback
  wordFile.addEventListener("focus", () => {
    wordFile.style.borderColor = "#4a63e7";
    wordFile.style.boxShadow = "0 0 8px rgba(74, 99, 231, 0.4)";
  });

  wordFile.addEventListener("blur", () => {
    wordFile.style.borderColor = "#ccc";
    wordFile.style.boxShadow = "none";
  });
}
