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

    this.expressions = {
      happy: "Alexa, tocar música",
      surprised: "Alexa, pausar",
      angry: "Alexa, parar música",
      sad: "Alexa, diminuir luzes",
      neutral: "Alexa, acender luzes",
    };

    this.expressionNames = {
      happy: "sorriso",
      surprised: "surpresa",
      angry: "raiva",
      sad: "tristeza",
      neutral: "neutro",
    };

    this.setupEventListeners();
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
          this.processRealExpression(detection.expressions);
        } else {
          document.getElementById("expressionText").textContent =
            "😐 Neutro (Nenhuma face)";
        }
      } catch (e) {
        console.error("Erro na detecção:", e);
      }
    }, 100);
  }

  processRealExpression(expressions) {
    let maxExpression = "neutral";
    let maxConfidence = 0;
    for (const [expression, confidence] of Object.entries(expressions)) {
      if (confidence > maxConfidence && confidence > 0.3) {
        maxConfidence = confidence;
        maxExpression = expression;
      }
    }
    const expressionPt = this.expressionNames[maxExpression] || "neutro";
    this.currentExpression = expressionPt;
    document.getElementById(
      "expressionText"
    ).textContent = `${this.getExpressionEmoji(expressionPt)} (${Math.round(
      maxConfidence * 100
    )}%)`;
    const now = Date.now();
    if (
      maxConfidence > 0.6 &&
      (!this.lastCommand || now - this.lastCommand > this.commandCooldown)
    ) {
      this.sendAlexaCommand(maxExpression);
      this.lastCommand = now;
    }
  }

  getExpressionEmoji(expression) {
    const emojis = {
      sorriso: "😊 Sorriso",
      surpresa: "😮 Surpresa",
      raiva: "😤 Raiva",
      tristeza: "😢 Tristeza",
      neutro: "😐 Neutro",
      happy: "😊 Sorriso",
      surprised: "😮 Surpresa",
      angry: "😤 Raiva",
      sad: "😢 Tristeza",
      neutral: "😐 Neutro",
    };
    return emojis[expression] || "😐 Neutro";
  }

  async sendAlexaCommand(expression) {
    const command = this.expressions[expression];
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
      this.getExpressionEmoji(this.currentExpression),
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

document.addEventListener(
  "DOMContentLoaded",
  () => new FacialExpressionDetector()
);
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(console.error);
