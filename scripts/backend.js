(function () {
    "use strict";

    const configuredApiBase = document.querySelector('meta[name="pbn-api-url"]').content.trim();
    const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const apiBase = (configuredApiBase || (
        isLocalDevelopment ? "http://127.0.0.1:8000" : window.location.origin
    )).replace(/\/+$/, "");
    const fileInput = document.getElementById("file");
    const uploadZone = document.getElementById("uploadZone");
    const uploadEmpty = document.getElementById("uploadEmpty");
    const uploadFilled = document.getElementById("uploadFilled");
    const sourcePreview = document.getElementById("sourcePreview");
    const generateButton = document.getElementById("btnProcess");
    const statusElement = document.getElementById("backendStatus");
    const resultSection = document.getElementById("results");
    const resultImage = document.getElementById("resultImage");
    const colorCount = document.getElementById("colorCount");
    const colorCountValue = document.getElementById("colorCountValue");
    const paletteElement = document.getElementById("palette");
    const previewButtons = [
        document.getElementById("showColor"),
        document.getElementById("showOutline")
    ];
    const difficulties = {
        easy: { colors: 12, minimumRegion: 50, resolution: 600 },
        medium: { colors: 20, minimumRegion: 25, resolution: 800 },
        detailed: { colors: 32, minimumRegion: 10, resolution: 1000 }
    };

    let selectedFile = null;
    let previewObjectUrl = null;
    let outlineObjectUrl = null;
    let generated = null;
    let activeRequest = null;

    document.getElementById("currentYear").textContent = new Date().getFullYear();

    function setStatus(message, state) {
        statusElement.textContent = message;
        statusElement.className = "status-message is-visible";
        if (state) statusElement.classList.add("is-" + state);
    }

    function clearResult() {
        generated = null;
        resultSection.hidden = true;
        if (outlineObjectUrl) URL.revokeObjectURL(outlineObjectUrl);
        outlineObjectUrl = null;
        previewButtons[0].classList.add("is-active");
        previewButtons[0].setAttribute("aria-selected", "true");
        previewButtons[1].classList.remove("is-active");
        previewButtons[1].setAttribute("aria-selected", "false");
    }

    function chooseFile(file) {
        if (!file) return;
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            setStatus("Choose a JPG, PNG, or WebP image to get started.", "error");
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setStatus("This image is larger than 20 MB. Choose a smaller file.", "error");
            return;
        }
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = URL.createObjectURL(file);
        selectedFile = file;
        sourcePreview.src = previewObjectUrl;
        uploadEmpty.hidden = true;
        uploadFilled.hidden = false;
        generateButton.disabled = false;
        clearResult();
        setStatus("Your photo is ready. Choose a detail level and create your template.");
    }

    fileInput.addEventListener("change", function () {
        chooseFile(fileInput.files && fileInput.files[0]);
    });

    uploadZone.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });
    uploadZone.addEventListener("dragover", function (event) {
        event.preventDefault();
        uploadZone.classList.add("is-dragging");
    });
    uploadZone.addEventListener("dragleave", function (event) {
        if (!uploadZone.contains(event.relatedTarget)) {
            uploadZone.classList.remove("is-dragging");
        }
    });
    uploadZone.addEventListener("drop", function (event) {
        event.preventDefault();
        uploadZone.classList.remove("is-dragging");
        chooseFile(event.dataTransfer.files && event.dataTransfer.files[0]);
    });

    document.querySelectorAll('input[name="difficulty"]').forEach(function (input) {
        input.addEventListener("change", function () {
            document.querySelectorAll(".difficulty-card").forEach(function (card) {
                card.classList.toggle("is-selected", card.contains(input) && input.checked);
            });
            if (input.checked) colorCount.value = difficulties[input.value].colors;
            updateColorCount();
        });
    });

    function updateColorCount() {
        colorCountValue.textContent = colorCount.value + " colors";
    }
    colorCount.addEventListener("input", updateColorCount);

    function selectedDifficulty() {
        const selected = document.querySelector('input[name="difficulty"]:checked');
        return selected ? difficulties[selected.value] : difficulties.medium;
    }

    function renderPalette(colors) {
        paletteElement.replaceChildren();
        colors.forEach(function (color) {
            const chip = document.createElement("div");
            chip.className = "palette-chip";
            const swatch = document.createElement("span");
            swatch.className = "palette-chip-swatch";
            swatch.style.backgroundColor = color.hex;
            const details = document.createElement("span");
            const number = document.createElement("strong");
            const area = document.createElement("small");
            number.textContent = color.number + " · " + color.hex;
            area.textContent = color.area_percentage + "% of your picture";
            details.append(number, area);
            chip.append(swatch, details);
            paletteElement.appendChild(chip);
        });
    }

    function showPreview(type) {
        if (!generated) return;
        const isOutline = type === "outline";
        resultImage.src = isOutline
            ? outlineObjectUrl
            : "data:image/png;base64," + generated.preview_png;
        resultImage.alt = isOutline
            ? "Numbered paint-by-numbers outline"
            : "Color preview of your paint-by-numbers artwork";
        previewButtons.forEach(function (button, index) {
            const active = index === (isOutline ? 1 : 0);
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
        });
    }

    previewButtons[0].addEventListener("click", function () { showPreview("color"); });
    previewButtons[1].addEventListener("click", function () { showPreview("outline"); });

    function showResult(data) {
        generated = data;
        outlineObjectUrl = URL.createObjectURL(
            new Blob([data.svg], { type: "image/svg+xml" })
        );
        document.getElementById("imageDimensions").textContent =
            data.image_size.width + " × " + data.image_size.height + " px";
        document.getElementById("resultSummary").textContent =
            data.statistics.final_region_count + " paintable areas · "
            + data.palette.length + " colors · " + data.timings_ms.total + " ms";
        renderPalette(data.palette);
        resultSection.hidden = false;
        showPreview("color");
        setStatus("Your painting kit is ready — choose a preview or download below.", "success");
        resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function generate() {
        if (!selectedFile) {
            setStatus("Add a photo first, then we can make your template.", "error");
            return;
        }
        if (activeRequest) activeRequest.abort();
        const request = new AbortController();
        activeRequest = request;
        generateButton.disabled = true;
        generateButton.classList.add("is-loading");
        generateButton.querySelector(".button-label").textContent = "Making your template…";
        setStatus("Finding the colors and shapes in your photo. This can take a little while.", "loading");

        const settings = selectedDifficulty();
        const form = new FormData();
        form.append("image", selectedFile, selectedFile.name);
        form.append("number_of_colors", colorCount.value);
        form.append("minimum_region_size", settings.minimumRegion);
        form.append("processing_resolution", settings.resolution);
        form.append("deterministic_seed", "42");
        form.append("kmeans_precision", "1");
        form.append("kmeans_color_space", "RGB");
        form.append("narrow_strip_cleanup_runs", "3");

        try {
            const response = await fetch(apiBase + "/api/generate", {
                method: "POST",
                body: form,
                signal: request.signal
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "We couldn’t make that template. Please try again.");
            }
            showResult(data);
        } catch (error) {
            if (error.name === "AbortError") return;
            setStatus(
                error instanceof TypeError
                    ? "We couldn’t reach the generator. Check that the backend is running, then try again."
                    : error.message,
                "error"
            );
        } finally {
            if (activeRequest === request) {
                activeRequest = null;
                generateButton.disabled = !selectedFile;
                generateButton.classList.remove("is-loading");
                generateButton.querySelector(".button-label").textContent = "Create my template";
            }
        }
    }

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function saveEncodedFile(data, contentType, filename) {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
            bytes[index] = binary.charCodeAt(index);
        }
        saveBlob(new Blob([bytes], { type: contentType }), filename);
    }

    generateButton.addEventListener("click", generate);
    document.getElementById("downloadPdf").addEventListener("click", function () {
        if (generated) {
            saveEncodedFile(generated.kit_pdf, "application/pdf", "paint-by-numbers-kit.pdf");
        }
    });
    document.getElementById("downloadColor").addEventListener("click", function () {
        if (generated) saveEncodedFile(generated.preview_png, "image/png", "color-preview.png");
    });
    document.getElementById("downloadOutline").addEventListener("click", function () {
        if (generated) saveEncodedFile(generated.template_png, "image/png", "numbered-outline.png");
    });
    document.getElementById("downloadSvg").addEventListener("click", function () {
        if (generated) saveBlob(
            new Blob([generated.svg], { type: "image/svg+xml" }),
            "numbered-outline.svg"
        );
    });
    document.getElementById("downloadPalette").addEventListener("click", function () {
        if (generated) saveEncodedFile(generated.legend_png, "image/png", "color-palette.png");
    });
    document.getElementById("makeAnother").addEventListener("click", function () {
        clearResult();
        fileInput.value = "";
        selectedFile = null;
        sourcePreview.removeAttribute("src");
        uploadEmpty.hidden = false;
        uploadFilled.hidden = true;
        generateButton.disabled = true;
        setStatus("Choose a photo when you’re ready to make another template.");
        document.getElementById("maker").scrollIntoView({ behavior: "smooth" });
    });

    const menuToggle = document.getElementById("menuToggle");
    const headerNav = document.querySelector(".header-nav");
    menuToggle.addEventListener("click", function () {
        const expanded = menuToggle.getAttribute("aria-expanded") === "true";
        menuToggle.setAttribute("aria-expanded", String(!expanded));
        menuToggle.setAttribute("aria-label", expanded ? "Open menu" : "Close menu");
        headerNav.classList.toggle("is-open", !expanded);
    });
    headerNav.addEventListener("click", function (event) {
        if (event.target.closest("a")) {
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.setAttribute("aria-label", "Open menu");
            headerNav.classList.remove("is-open");
        }
    });

    fetch(apiBase + "/api/health")
        .then(function (response) {
            if (!response.ok) throw new Error("Generator is not available.");
            return response.json();
        })
        .then(function () {
            setStatus("Ready when you are. Your photo stays on this device until you create a template.");
        })
        .catch(function () {
            setStatus("The generator is taking a break. Start the backend server, then refresh this page.", "error");
        });
}());
