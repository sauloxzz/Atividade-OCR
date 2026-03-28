// ------------------- VARIÁVEIS GLOBAIS de DOM e Azure -------------------

const fileInput = document.getElementById("imagem");
const btnOCR = document.getElementById("btnOCR");
const textoOCRArea = document.getElementById("texto_ocr");
const divMensagens = document.getElementById("div_mensagens");
const divResultadosOCR = document.getElementById("div_resultados_ocr");

// Substitua pelos seus valores do Azure:
const visionEndpoint = "https://southafricanorth.api.cognitive.microsoft.com/"; // ex: https://brazilsouth.api.cognitive.microsoft.com/
const visionKey = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

btnOCR.addEventListener("click", executeOCR);

function clearResults() {
    divMensagens.textContent = "";
    textoOCRArea.value = "";
    divResultadosOCR.innerHTML = "";
    divResultadosOCR.style.display = "block";
}

function addLog(message, type = "info") {
    const line = document.createElement("div");
    line.className = `message ${type}`;
    line.textContent = message;
    divMensagens.appendChild(line);
    divMensagens.scrollTop = divMensagens.scrollHeight;
}

function drawBoundingBoxes(file, data) {
    if (!data?.analyzeResult?.readResults && !data?.recognitionResults) return;

    // Exibe imagem e retângulos (se quiser)
    const container = document.createElement("div");
    container.id = "image_container";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    container.appendChild(img);

    const results = data.analyzeResult?.readResults || data.recognitionResults;

    // wait image size
    img.addEventListener("load", () => {
        const scaleX = img.clientWidth / img.naturalWidth;
        const scaleY = img.clientHeight / img.naturalHeight;

        results.forEach(page => {
            (page.lines || []).forEach(line => {
                if (!line.boundingBox || line.boundingBox.length < 8) return;
                const [x1, y1, x2, y2, x3, y3, x4, y4] = line.boundingBox;
                const minX = Math.min(x1, x2, x3, x4) * scaleX;
                const maxX = Math.max(x1, x2, x3, x4) * scaleX;
                const minY = Math.min(y1, y2, y3, y4) * scaleY;
                const maxY = Math.max(y1, y2, y3, y4) * scaleY;

                const box = document.createElement("div");
                box.className = "bounding-box-ocr";
                box.style.left = `${minX}px`;
                box.style.top = `${minY}px`;
                box.style.width = `${maxX - minX}px`;
                box.style.height = `${maxY - minY}px`;
                container.appendChild(box);
            });
        });
    });

    divResultadosOCR.appendChild(container);
}
// ------------------- FUNÇÃO PRINCIPAL DE OCR -------------------

async function executeOCR() {
    clearResults();
    const file = fileInput.files[0];

    if (!file) {
        addLog("🚫 Por favor, selecione um arquivo de imagem ou PDF primeiro.", 'error');
        return;
    }

    // A URL da API Read/Analyze (assíncrona) v3.2
    const url = `${visionEndpoint}vision/v3.2/read/analyze`;
    let operationLocation = null;

    try {
        addLog(`Iniciando OCR para o arquivo: ${file.name}...`, 'info');

        // 1️⃣ Converte o arquivo para binário e envia
        const arrayBuffer = await file.arrayBuffer();
        addLog("1/4: Enviando imagem para o Azure (POST /read/analyze)...", 'info');

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": visionKey,
                "Content-Type": "application/octet-stream", // Formato binário para upload de arquivo
            },
            body: arrayBuffer,
        });

        if (response.status !== 202) {
            const errorBody = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`Erro ${response.status}: ${errorBody.message || 'Falha no envio da requisição.'}`);
        }

        // 2️⃣ Pega o link para consultar o resultado (Polling URL)
        operationLocation = response.headers.get("operation-location");
        addLog(`2/4: Imagem enviada com sucesso. URL de consulta (Polling): ${operationLocation}`, 'info');

        // 3️⃣ Loop de Polling (Consulta do Status)
        let data = null;
        const maxAttempts = 15;
        let attempts = 0;
        const delay = 3000; // Espera 3 segundos

        while (attempts < maxAttempts) {
            attempts++;
            
            await new Promise((r) => setTimeout(r, delay)); // Espera o delay
            addLog(`3/4: Tentativa ${attempts}/${maxAttempts}: Verificando status do processamento...`, 'info');

            const resultResponse = await fetch(operationLocation, {
                headers: { "Ocp-Apim-Subscription-Key": visionKey },
            });
            data = await resultResponse.json();

            if (data.status === "succeeded") {
                addLog("4/4: Processamento OCR concluído com sucesso! ✅", 'success');
                break;
            }
            if (data.status === "failed") {
                throw new Error(`Processamento OCR falhou: ${data.message || 'Detalhes desconhecidos'}`);
            }
            if (attempts === maxAttempts) {
                 throw new Error("O processamento excedeu o tempo máximo de espera.");
            }
            // Se for "running", o loop continua
        }

        // 4️⃣ Extrai e exibe o texto reconhecido
        let texto = "";
        const results = data.analyzeResult?.readResults || data.recognitionResults;

        if (results) {
            // Mapeia todas as linhas de todas as páginas, unindo-as com quebras de linha
            texto = results
                .map((page) => page.lines.map((line) => line.text).join(" "))
                .join("\n");
            
            textoOCRArea.value = texto;
            addLog(`📝 Texto lido (total de linhas: ${results.reduce((acc, page) => acc + page.lines.length, 0)}):`, 'success');

        } else {
            texto = "Não foi possível ler o texto ou o formato do resultado é desconhecido.";
            textoOCRArea.value = texto;
            addLog(texto, 'error');
        }

        // 5️⃣ Desenha as delimitações visuais
        drawBoundingBoxes(file, data);

    } catch (error) {
        console.error("❌ Erro OCR:", error);
        addLog(`Erro ao processar OCR: ${error.message}`, 'error');
        divResultadosOCR.style.display = "none";
    }
}