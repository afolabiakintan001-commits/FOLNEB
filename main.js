const convertBtn = document.getElementById("convertBtn");
const sourceFileInput = document.getElementById("wordFile");
const spinner = document.getElementById("spinner");
const result = document.getElementById("result");
const fileName = document.getElementById("fileName");
const converterForm = document.getElementById("converterForm");
const conversionTypeSelect = document.getElementById("conversionType");
const fileLabelText = document.getElementById("fileLabelText");
const fileHint = document.getElementById("fileHint");
const conversionSummary = document.getElementById("conversionSummary");
const advancedOptionsList = document.getElementById("advancedOptions");
const advancedNote = document.getElementById("advancedNote");

if (
  convertBtn &&
  sourceFileInput &&
  spinner &&
  result &&
  converterForm &&
  conversionTypeSelect &&
  fileLabelText &&
  fileHint &&
  conversionSummary &&
  advancedOptionsList &&
  advancedNote
) {
  const conversionOptions = {
    "word-to-pdf": {
      buttonIdle: "Convert to PDF",
      buttonBusy: "Converting…",
      fileLabel: "Select a Word document",
      fileHint: "Supported formats: .docx, .doc",
      missingFileMessage: "⚠ Please select a Word document before converting.",
      summary: "Word → PDF · Preserve your document formatting and fonts.",
      accept:
        ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      outputExtension: ".pdf",
      progressMessage: "Preparing your PDF…",
      successMessage: "Your PDF is ready to download.",
      successDetail: "All fonts, comments, and tracked changes stay intact.",
      downloadAriaLabel: "Download converted PDF",
      delay: 2000,
      enhancements: [
        {
          label: "Retain hyperlinks",
          description: "Keep clickable links active when moving to PDF.",
        },
        {
          label: "Embed brand fonts",
          description: "Ensure corporate fonts travel with the document.",
        },
      ],
      note: "Tip: Map these toggles to your conversion API flags when going live.",
    },
    // other conversion options stay same as your original file...
  };

  const normalizeType = (value) => (value || "").toLowerCase();
  const fallbackConfig = conversionOptions["word-to-pdf"];
  let currentConfig = fallbackConfig;

  const setBusyState = (isBusy) => {
    const activeConfig = currentConfig ?? fallbackConfig;
    spinner.hidden = !isBusy;
    spinner.setAttribute("aria-hidden", String(!isBusy));
    convertBtn.disabled = isBusy;
    convertBtn.setAttribute("aria-busy", String(isBusy));
    convertBtn.textContent = isBusy ? activeConfig.buttonBusy : activeConfig.buttonIdle;

    if (isBusy) {
      result.textContent = activeConfig.progressMessage;
      result.classList.remove("success");
    }
  };

  const resetFeedback = () => {
    result.innerHTML = "";
    result.classList.remove("success");
  };

  const updateFileName = (fileList) => {
    if (!fileName) return;

    if (!fileList || fileList.length === 0) {
      fileName.textContent = "No file selected yet.";
      return;
    }

    if (fileList.length === 1) {
      fileName.textContent = `Selected: ${fileList[0].name}`;
      return;
    }

    fileName.textContent = `Selected ${fileList.length} files.`;
  };

  const createDownloadName = (originalName, extension) => {
    if (!originalName) {
      return `converted${extension}`;
    }

    const base = originalName.includes(".")
      ? originalName.replace(/\.[^/.]+$/, "")
      : originalName;

    const safeBase = base.trim() || "converted";
    return `${safeBase}${extension}`;
  };

  const renderEnhancements = (config) => {
    advancedOptionsList.innerHTML = "";

    const enhancements = Array.isArray(config.enhancements) ? config.enhancements : [];

    if (enhancements.length === 0) {
      const placeholder = document.createElement("li");
      placeholder.className = "advanced-options__placeholder";
      placeholder.textContent = "No additional controls for this recipe—just upload and convert.";
      advancedOptionsList.appendChild(placeholder);
    } else {
      enhancements.forEach((item) => {
        const li = document.createElement("li");
        li.className = "advanced-options__item";

        const label = document.createElement("span");
        label.className = "advanced-options__label";
        label.textContent = item.label;

        const description = document.createElement("span");
        description.className = "advanced-options__description";
        description.textContent = item.description;

        li.appendChild(label);
        li.appendChild(description);
        advancedOptionsList.appendChild(li);
      });
    }

    advancedNote.textContent = config.note || "";
    advancedNote.hidden = !advancedNote.textContent;
  };

  const buildSuccessState = (files) => {
    const fileArray = Array.isArray(files) ? files : files ? [files] : [];
    const baseName = currentConfig.defaultDownloadName || fileArray[0]?.name || "converted";
    const downloadName = createDownloadName(baseName, currentConfig.outputExtension || ".pdf");

    const message = document.createElement("p");
    message.className = "result-message";
    message.textContent = currentConfig.successMessage;
    result.appendChild(message);

    if (currentConfig.successDetail) {
      const detailText =
        typeof currentConfig.successDetail === "function"
          ? currentConfig.successDetail(fileArray)
          : currentConfig.successDetail;

      if (detailText) {
        const detail = document.createElement("p");
        detail.className = "result-detail";
        detail.textContent = detailText;
        result.appendChild(detail);
      }
    }

    const list = document.createElement("ul");
    list.className = "result-files";

    fileArray.forEach((file) => {
      const listItem = document.createElement("li");
      listItem.textContent = file.name;
      list.appendChild(listItem);
    });

    if (fileArray.length > 0) {
      result.appendChild(list);
    }

    const link = document.createElement("a");
    link.href = "#"; // Replace with backend API endpoint for real conversion
    link.download = downloadName;
    link.textContent = `⬇ Download ${downloadName}`;
    link.classList.add("download-link");
    link.setAttribute("aria-label", `${currentConfig.downloadAriaLabel}: ${downloadName}`);

    result.classList.add("success");
    result.appendChild(link);
    link.focus();
  };

  const applyConversionConfig = (type) => {
    const config = conversionOptions[type] || fallbackConfig;
    currentConfig = config;

    if (conversionTypeSelect.value !== type && conversionOptions[type]) {
      conversionTypeSelect.value = type;
    } else if (!conversionOptions[type]) {
      conversionTypeSelect.value = "word-to-pdf";
    }

    fileLabelText.textContent = config.fileLabel;
    fileHint.textContent = config.fileHint;
    conversionSummary.textContent = config.summary;
    sourceFileInput.accept = config.accept;
    convertBtn.textContent = config.buttonIdle;
    sourceFileInput.value = "";
    sourceFileInput.multiple = Boolean(config.multiple);

    if (config.multiple) {
      sourceFileInput.setAttribute("multiple", "");
    } else {
      sourceFileInput.removeAttribute("multiple");
    }

    updateFileName(null);
    resetFeedback();
    renderEnhancements(config);
  };

  const params = new URLSearchParams(window.location.search);
  const requestedType = normalizeType(params.get("type"));
  const selectValue = normalizeType(conversionTypeSelect.value);
  const defaultType = conversionOptions[requestedType] ? requestedType : selectValue;
  applyConversionConfig(defaultType);

  conversionTypeSelect.addEventListener("change", (event) => {
    applyConversionConfig(normalizeType(event.target.value));
  });

  sourceFileInput.addEventListener("change", () => {
    const files = sourceFileInput.files;
    updateFileName(files);
  });

  sourceFileInput.addEventListener("focus", () => {
    sourceFileInput.classList.add("is-focused");
  });

  sourceFileInput.addEventListener("blur", () => {
    sourceFileInput.classList.remove("is-focused");
  });

  converterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const files = sourceFileInput.files;
    const fileArray = files ? Array.from(files) : [];

    resetFeedback();

    if (!fileArray.length || (currentConfig.minFiles && fileArray.length < currentConfig.minFiles)) {
      const errorMessage = document.createElement("p");
      errorMessage.className = "error";
      errorMessage.textContent = currentConfig.missingFileMessage;
      result.appendChild(errorMessage);
      return;
    }

    if (currentConfig.maxFiles && fileArray.length > currentConfig.maxFiles) {
      const errorMessage = document.createElement("p");
      errorMessage.className = "error";
      errorMessage.textContent = `⚠ You can upload up to ${currentConfig.maxFiles} files for this recipe.`;
      result.appendChild(errorMessage);
      return;
    }

    setBusyState(true);

    setTimeout(() => {
      setBusyState(false);
      resetFeedback();
      buildSuccessState(fileArray);
    }, currentConfig.delay || 2000);
  });
}
