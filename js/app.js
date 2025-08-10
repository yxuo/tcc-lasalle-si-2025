class FacialExpressionDetector {
  constructor() {
    this.video = document.getElementById("videoElement");
    this.canvas = document.getElementById("overlay");
    this.ctx = this.canvas.getContext("2d");
    this.cameraSelect = document.getElementById("cameraSelect");
    this.isRunning = false;
    this.currentExpression = "neutro";
    this.lastCommand = null;
    this.commandCooldown = 3000;
    this.modelsLoaded = false;
    this.detectionInterval = null;
    this.availableCameras = [];
    this.selectedCameraId = null;

    // Usar o motor de expressões faciais separado
    this.expressionEngine = new FacialExpressionEngine();

    this.setupEventListeners();
    this.renderCommandsList();
    this.loadCameras();
    this.loadModels();
  }

  async loadCameras() {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableCameras = devices.filter((d) => d.kind === "videoinput");
      const savedCameraId = localStorage.getItem("selectedCameraId");
      this.cameraSelect.innerHTML = "";
      if (this.availableCameras.length === 0) {
        this.cameraSelect.innerHTML =
          '<option value="">Nenhuma câmera encontrada</option>';
        document.getElementById("cameraInfo").textContent =
          "Nenhuma câmera disponível";
        return;
      }
      this.availableCameras.forEach((camera, index) => {
        const option = document.createElement("option");
        option.value = camera.deviceId;
        let cameraName = camera.label || `Câmera ${index + 1}`;
        // Remove códigos de hardware entre parênteses que contenham números/hex (ex: (045e:0779), (usb-0000))
        cameraName = cameraName
          .replace(/\([^)]*[0-9a-fA-F]{3,}[^)]*\)/g, "")
          .trim();
        cameraName = cameraName.replace(/\s{2,}/g, " ");
        if (/front|user|frontal/i.test(cameraName)) cameraName += " (Frontal)";
        else if (/back|environment|traseir|rear/i.test(cameraName))
          cameraName += " (Traseira)";
        option.textContent = cameraName;
        if (
          savedCameraId === camera.deviceId ||
          (!savedCameraId && index === 0)
        ) {
          option.selected = true;
          this.selectedCameraId = camera.deviceId;
        }
        this.cameraSelect.appendChild(option);
      });
      // Fallback: se id salvo não encontrado, seleciona a primeira câmera
      if (!this.selectedCameraId && this.availableCameras.length > 0) {
        this.selectedCameraId = this.availableCameras[0].deviceId;
        this.cameraSelect.value = this.selectedCameraId;
        localStorage.setItem("selectedCameraId", this.selectedCameraId);
      }
      const cameraInfo = document.getElementById("cameraInfo");
      cameraInfo.textContent = `${this.availableCameras.length} ${
        this.availableCameras.length > 1
          ? "câmeras disponíveis"
          : "câmera disponível"
      } • Configuração salva automaticamente`;

      // Inicia câmera automaticamente após carregar câmeras e modelos
      this.tryAutoStart();
    } catch (e) {
      console.error("Erro ao carregar câmeras:", e);
      this.cameraSelect.innerHTML =
        '<option value="">Erro ao carregar câmeras</option>';
      document.getElementById("cameraInfo").textContent =
        "Erro: Permissão de câmera necessária";
    }
  }

  async loadModels() {
    try {
      this.updateStatus("Carregando modelos de IA...", true);
      const MODEL_URL =
        "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      this.modelsLoaded = true;
      this.updateStatus(
        "✅ Modelos carregados! Pronto para começar",
        false,
        false,
        true
      );
      setTimeout(() => this.updateStatus("Pronto para começar"), 2000);

      // Inicia câmera automaticamente após carregar câmeras e modelos
      this.tryAutoStart();
    } catch (e) {
      this.updateStatus(
        "❌ Erro ao carregar modelos: " + e.message,
        false,
        true
      );
      console.error("Erro ao carregar modelos:", e);
    }
  }

  tryAutoStart() {
    // Só inicia automaticamente se modelos e câmeras estiverem carregados
    if (
      this.modelsLoaded &&
      this.availableCameras.length > 0 &&
      !this.isRunning
    ) {
      setTimeout(() => {
        this.startCamera();
      }, 1000); // Pequeno delay para garantir que tudo foi inicializado
    }
  }

  setupEventListeners() {
    document
      .getElementById("startBtn")
      .addEventListener("click", () => this.startCamera());
    document
      .getElementById("stopBtn")
      .addEventListener("click", () => this.stopCamera());
    document
      .getElementById("calibrateBtn")
      .addEventListener("click", () => this.calibrate());

    // Event listeners para configuração
    document
      .getElementById("configBtn")
      .addEventListener("click", () => this.openConfigModal());
    document
      .getElementById("closeModal")
      .addEventListener("click", () => this.closeConfigModal());
    document
      .getElementById("saveConfig")
      .addEventListener("click", () => this.saveConfiguration());
    document
      .getElementById("resetConfig")
      .addEventListener("click", () => this.resetConfiguration());
    document
      .getElementById("addCustomExpression")
      .addEventListener("click", () => this.addCustomExpression());

    // Fechar modal ao clicar fora
    document.getElementById("configModal").addEventListener("click", (e) => {
      if (e.target.id === "configModal") this.closeConfigModal();
    });

    this.cameraSelect.addEventListener("change", (e) => {
      this.selectedCameraId = e.target.value;
      localStorage.setItem("selectedCameraId", this.selectedCameraId);
      const selectedOption = e.target.selectedOptions[0];
      const cameraInfo = document.getElementById("cameraInfo");
      cameraInfo.textContent = `✅ ${selectedOption.textContent} selecionada`;
      setTimeout(() => {
        cameraInfo.textContent = `${this.availableCameras.length} ${
          this.availableCameras.length > 1
            ? "câmeras disponíveis"
            : "câmera disponível"
        } • Configuração salva automaticamente`;
      }, 3000);
      if (this.isRunning) {
        this.updateStatus("Trocando câmera...", true);
        this.stopCamera();
        setTimeout(() => this.startCamera(), 500);
      }
    });
  }

  async startCamera() {
    if (!this.modelsLoaded) {
      this.updateStatus("Aguarde os modelos carregarem...", false, true);
      return;
    }
    try {
      this.updateStatus("Iniciando câmera...", true);
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      };
      if (this.selectedCameraId) {
        constraints.video.deviceId = { exact: this.selectedCameraId };
        delete constraints.video.facingMode;
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = stream;
      this.video.onloadedmetadata = () => {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.startDetection();
      };
      document.getElementById("startBtn").disabled = true;
      document.getElementById("stopBtn").disabled = false;
      document.getElementById("calibrateBtn").disabled = false;
      this.isRunning = true;
      this.updateStatus("Câmera ativa - Detectando expressões");
    } catch (e) {
      this.updateStatus("Erro ao acessar câmera: " + e.message, false, true);
      console.error("Erro detalhado da câmera:", e);
    }
  }

  stopCamera() {
    this.isRunning = false;
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((t) => t.stop());
      this.video.srcObject = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    document.getElementById("startBtn").disabled = false;
    document.getElementById("stopBtn").disabled = true;
    document.getElementById("calibrateBtn").disabled = true;
    this.updateStatus("Câmera desligada");
    document.getElementById("expressionText").textContent = "Nenhuma";
  }

  async startDetection() {
    if (!this.isRunning || !this.modelsLoaded) return;
    this.detectionInterval = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        const detections = await faceapi
          .detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (detections && detections.length > 0) {
          const detection = detections[0];
          this.drawFaceDetection(detection.detection.box);

          // Usar o motor de expressões para processar
          const result = this.expressionEngine.processExpressions(
            detection.expressions,
            detection.landmarks
          );

          this.updateExpressionDisplay(result);

          if (result.triggered) {
            this.sendAlexaCommand(result.expression, result.config);
          }
        } else {
          document.getElementById("expressionText").textContent =
            "😐 Neutro (Nenhuma face)";
        }
      } catch (e) {
        console.error("Erro na detecção:", e);
      }
    }, 100);
  }

  updateExpressionDisplay(result) {
    this.currentExpression = result.expression;
    const expressionName = this.expressionEngine.getExpressionDisplayName(
      result.expression
    );

    if (result.progress > 0 && result.config) {
      const holdTime = result.config.holdTime || 2.0;
      document.getElementById(
        "expressionText"
      ).textContent = `${expressionName} (${Math.round(
        result.progress
      )}% - ${holdTime}s)`;
    } else {
      document.getElementById(
        "expressionText"
      ).textContent = `${expressionName} (${Math.round(
        result.confidence * 100
      )}%)`;
    }
  }

  renderCommandsList() {
    const container = document.getElementById("commandsList");
    container.innerHTML = "";

    const activeExpressions = this.expressionEngine.getActiveExpressions();

    activeExpressions.forEach((expression) => {
      const item = document.createElement("div");
      item.className = "command-item";
      item.innerHTML = `
        <span class="emotion">${expression.name}</span>
        <span>🎵 "${expression.command}" (${expression.holdTime}s)</span>
      `;
      container.appendChild(item);
    });
  }

  openConfigModal() {
    document.getElementById("configModal").style.display = "flex";
    this.populateConfigModal();
  }

  closeConfigModal() {
    document.getElementById("configModal").style.display = "none";
  }

  populateConfigModal() {
    const container = document.getElementById("expressionConfigs");
    container.innerHTML = "";

    const allExpressions = this.expressionEngine.getAllExpressions();

    // Obter todas as opções possíveis de expressão
    const allOptions = allExpressions.map((e) => ({
      key: e.key,
      name: e.name,
    }));
    allExpressions.forEach((expression) => {
      const expressionDiv = document.createElement("div");
      expressionDiv.className = "expression-config";
      expressionDiv.innerHTML = `
        <div class="config-row">
          <label class="input-label">
        Expressão
        <select class="expression-select" onchange="window.detector.updateExpressionKey('${
          expression.key
        }', this.value)">
          ${allOptions
            .map(
              (opt) =>
                `<option value="${opt.key}" ${
                  opt.key === expression.key ? "selected" : ""
                }>${opt.name}</option>`
            )
            .join("")}
        </select>
          </label>
          <label class="input-label">
        Comando
        <input type="text" value="${expression.command}" 
           placeholder="Comando Alexa..." 
           onchange="window.detector.updateExpressionCommand('${
             expression.key
           }', this.value)">
          </label>
          <label class="input-label">
            Tempo (s)<br>
            <input type="number" class="time-input" value="${
              expression.holdTime
            }" 
              min="0.5" max="10" step="0.5" placeholder="Tempo"
              onchange="window.detector.updateExpressionHoldTime('${
                expression.key
              }', this.value)">
          </label>
          <div class="action-buttons">
        <button class="remove-btn" onclick="window.detector.removeExpression('${
          expression.key
        }')" title="Remover" style="margin-top: 15px;">
          <i class="fa-solid fa-trash"></i>
        </button>
          </div>
        </div>
      `;
      container.appendChild(expressionDiv);
    });

    // Formulário para adicionar expressão customizada (igual aos itens, com select)
    const formDiv = document.createElement("div");
    formDiv.className = "expression-config expression-add-form";
    
    // Criar lista de expressões preset disponíveis
    const presetExpressions = [
      { key: "😊 Sorriso", name: "😊 Sorriso" },
      { key: "😮 Surpresa", name: "😮 Surpresa" },
      { key: "😤 Raiva", name: "😤 Raiva" },
      { key: "😢 Tristeza", name: "😢 Tristeza" },
      { key: "😐 Neutro", name: "😐 Neutro" },
      { key: "😉 Piscar Olho Esquerdo", name: "😉 Piscar Olho Esquerdo" },
      { key: "😜 Piscar Olho Direito", name: "😜 Piscar Olho Direito" },
      { key: "🙂 Sorrir Lado Esquerdo", name: "🙂 Sorrir Lado Esquerdo" },
      { key: "🙃 Sorrir Lado Direito", name: "🙃 Sorrir Lado Direito" },
      { key: "😟 Franzir Testa", name: "😟 Franzir Testa" },
      { key: "😲 Boca Aberta", name: "😲 Boca Aberta" },
      { key: "🤨 Levantar Sobrancelha", name: "🤨 Levantar Sobrancelha" },
      { key: "😗 Bico", name: "😗 Bico" },
      { key: "😎 Óculos", name: "😎 Óculos" },
      { key: "😴 Sonolento", name: "😴 Sonolento" },
      { key: "🤔 Pensativo", name: "🤔 Pensativo" }
    ];
    
    formDiv.innerHTML = `
      <div class="config-row">
        <label class="input-label">
          Expressão
          <select id="newExpressionName" class="expression-select">
            <option value="">Selecione...</option>
            ${presetExpressions
              .map((opt) => `<option value="${opt.key}">${opt.name}</option>`)
              .join("")}
            <option value="custom">✨ Nova Expressão Personalizada</option>
          </select>
          <input type="text" id="newExpressionNameCustom" class="expression-select" placeholder="Nome personalizado" style="display:none; margin-top:6px;" />
        </label>
        <label class="input-label">
          Comando
          <input type="text" id="newExpressionCommand" placeholder="Comando Alexa">
        </label>
        <label class="input-label">
          Tempo (s)
          <input type="number" id="newExpressionHoldTime" class="time-input" min="0.5" max="10" step="0.5" placeholder="Tempo (s)">
        </label>
        <div class="action-buttons">
          <button class="add-btn" onclick="window.detector.handleAddCustomExpression()" title="Adicionar" style="margin-top: 15px;">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(formDiv);

    // Mostrar input customizado se "Nova Expressão" for selecionada
    setTimeout(() => {
      const select = document.getElementById("newExpressionName");
      const customInput = document.getElementById("newExpressionNameCustom");
      if (select && customInput) {
        select.addEventListener("change", function () {
          if (this.value === "custom") {
            customInput.style.display = "block";
          } else {
            customInput.style.display = "none";
          }
        });
      }
    }, 100);
  }

  updateExpressionCommand(key, command) {
    this.expressionEngine.updateExpression(key, { command });
  }

  updateExpressionHoldTime(key, holdTime) {
    this.expressionEngine.updateExpression(key, {
      holdTime: parseFloat(holdTime),
    });
  }

  toggleExpression(key, enabled) {
    this.expressionEngine.updateExpression(key, { enabled });
  }

  removeExpression(key) {
    if (this.expressionEngine.removeExpression(key)) {
      this.populateConfigModal();
    } else {
      alert(
        "Não é possível remover expressões padrão. Use o botão 'Ativo' para desabilitá-las."
      );
    }
  }

  handleAddCustomExpression() {
    let name = document.getElementById("newExpressionName").value;
    const customNameInput = document.getElementById("newExpressionNameCustom");
    if (name === "custom" && customNameInput) {
      name = customNameInput.value.trim();
    }
    const command = document
      .getElementById("newExpressionCommand")
      .value.trim();
    const holdTime = parseFloat(
      document.getElementById("newExpressionHoldTime").value
    );
    if (name && command && holdTime) {
      this.expressionEngine.addCustomExpression(name, command, holdTime);
      this.populateConfigModal();
    } else {
      alert("Preencha todos os campos para adicionar uma expressão.");
    }
  }

  updateExpressionKey(oldKey, newKey) {
    // Troca a expressão associada ao comando (apenas para customizadas)
    if (
      oldKey !== newKey &&
      this.expressionEngine.expressions[oldKey] &&
      this.expressionEngine.expressions[newKey]
    ) {
      // Troca apenas o comando, tempo e enabled para a nova expressão
      const oldConfig = this.expressionEngine.expressions[oldKey];
      this.expressionEngine.updateExpression(newKey, {
        command: oldConfig.command,
        holdTime: oldConfig.holdTime,
        enabled: oldConfig.enabled,
      });
      this.expressionEngine.removeExpression(oldKey);
      this.populateConfigModal();
    }
  }

  saveConfiguration() {
    this.expressionEngine.saveExpressionConfig();
    this.renderCommandsList();
    this.closeConfigModal();
    this.updateStatus("✅ Configurações salvas!", false, false, true);
    setTimeout(() => {
      if (this.isRunning) this.updateStatus("Detectando expressões...");
    }, 2000);
  }

  resetConfiguration() {
    if (confirm("Resetar para configurações padrão?")) {
      this.expressionEngine.resetToDefault();
      this.populateConfigModal();
      this.renderCommandsList();
      this.updateStatus("🔄 Configurações resetadas!", false, false, true);
    }
  }

  async sendAlexaCommand(expression, config) {
    if (!config || !config.enabled) return;

    const command = config.command;
    try {
      this.updateStatus(`Enviando comando: "${command}"`, true);
      await this.simulateAlexaRequest(command);
      this.updateStatus(`✅ Comando enviado: "${command}"`, false, false, true);
      setTimeout(() => {
        if (this.isRunning) this.updateStatus("Detectando expressões...");
      }, 2000);
    } catch (e) {
      this.updateStatus("❌ Erro ao enviar comando: " + e.message, false, true);
    }
  }

  async simulateAlexaRequest(command) {
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
    if (Math.random() < 0.05) throw new Error("Falha na conexão com Alexa");
    console.log("Comando simulado enviado para Alexa:", command);
  }

  drawFaceDetection(faceBox) {
    this.ctx.strokeStyle = "#00ff00";
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([]);
    this.ctx.strokeRect(faceBox.x, faceBox.y, faceBox.width, faceBox.height);
    this.ctx.fillStyle = "#00ff00";
    this.ctx.font = "20px Arial";
    this.ctx.fillText(
      this.expressionEngine.getExpressionDisplayName(this.currentExpression),
      faceBox.x,
      faceBox.y - 10
    );
    this.ctx.fillStyle = "#00ff00";
    this.ctx.font = "14px Arial";
    this.ctx.fillText(
      "Face detectada",
      faceBox.x,
      faceBox.y + faceBox.height + 20
    );
  }

  calibrate() {
    this.updateStatus(
      "Calibrando... Faça uma expressão neutra por 3 segundos",
      true
    );
    let neutralSamples = [];
    const start = Date.now();
    const interval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }
      try {
        const detections = await faceapi
          .detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();
        if (detections && detections.length > 0)
          neutralSamples.push(detections[0].expressions);
      } catch (e) {
        console.error("Erro na calibração:", e);
      }
      if (Date.now() - start >= 3000) {
        clearInterval(interval);
        this.updateStatus("✅ Calibração concluída!", false, false, true);
        setTimeout(() => {
          if (this.isRunning) this.updateStatus("Detectando expressões...");
        }, 2000);
      }
    }, 200);
  }

  updateStatus(text, loading = false, error = false, success = false) {
    const statusElement = document.getElementById("statusText");
    const statusContainer = statusElement.parentElement.parentElement;
    statusContainer.classList.remove("error", "success", "loading");
    if (error) statusContainer.classList.add("error");
    else if (success) statusContainer.classList.add("success");
    else if (loading) statusContainer.classList.add("loading");
    while (statusElement.firstChild)
      statusElement.removeChild(statusElement.firstChild);
    if (loading) {
      const wrapper = document.createElement("span");
      wrapper.className = "status-text-wrapper";
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      const label = document.createElement("span");
      label.textContent = text;
      wrapper.appendChild(spinner);
      wrapper.appendChild(label);
      statusElement.appendChild(wrapper);
    } else statusElement.textContent = text;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.detector = new FacialExpressionDetector();
});

if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(console.error);
