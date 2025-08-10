/**
 * FacialExpressionEngine - Motor de detecção de expressões faciais
 * Responsável por detectar e processar expressões básicas e customizadas
 */
class FacialExpressionEngine {
  constructor() {
    this.defaultExpressions = {
      happy: {
        name: "😊 Sorriso",
        command: "Alexa, tocar música",
        enabled: true,
        holdTime: 2.0,
      },
      surprised: {
        name: "😮 Surpresa",
        command: "Alexa, pausar",
        enabled: true,
        holdTime: 2.0,
      },
      angry: {
        name: "😤 Raiva",
        command: "Alexa, parar música",
        enabled: true,
        holdTime: 2.0,
      },
      sad: {
        name: "😢 Tristeza",
        command: "Alexa, diminuir luzes",
        enabled: true,
        holdTime: 2.0,
      },
      neutral: {
        name: "😐 Neutro",
        command: "Alexa, acender luzes",
        enabled: true,
        holdTime: 2.0,
      },
      leftEyeWink: {
        name: "😉 Piscar Olho Esquerdo",
        command: "Alexa, próxima música",
        enabled: false,
        holdTime: 1.0,
      },
      rightEyeWink: {
        name: "😜 Piscar Olho Direito",
        command: "Alexa, música anterior",
        enabled: false,
        holdTime: 1.0,
      },
      leftSmile: {
        name: "🙂 Sorrir Lado Esquerdo",
        command: "Alexa, aumentar volume",
        enabled: false,
        holdTime: 1.5,
      },
      rightSmile: {
        name: "🙃 Sorrir Lado Direito",
        command: "Alexa, diminuir volume",
        enabled: false,
        holdTime: 1.5,
      },
      frownBrow: {
        name: "😟 Franzir Testa",
        command: "Alexa, que horas são",
        enabled: false,
        holdTime: 2.5,
      },
      mouthOpen: {
        name: "😲 Boca Aberta",
        command: "Alexa, qual o tempo hoje",
        enabled: false,
        holdTime: 1.5,
      },
    };

    this.expressions = this.loadExpressionConfig();
    this.confidenceThreshold = 0.6;
    this.expressionStates = new Map(); // Track individual expression timing
  }

  /**
   * Detecta expressões básicas do Face-api.js
   */
  detectBasicExpressions(expressions) {
    let maxExpression = "neutral";
    let maxConfidence = 0;

    for (const [expression, confidence] of Object.entries(expressions)) {
      if (confidence > maxConfidence && confidence > 0.3) {
        maxConfidence = confidence;
        maxExpression = expression;
      }
    }

    return { expression: maxExpression, confidence: maxConfidence };
  }

  /**
   * Detecta expressões customizadas baseadas em landmarks faciais
   */
  detectCustomExpressions(landmarks) {
    if (!landmarks) return {};

    const customExpressions = {};
    const points = landmarks.positions;

    try {
      // Piscar olho esquerdo/direito (do ponto de vista da pessoa)
      const leftEyeHeight = this.calculateEyeHeight(points, 37, 41);
      const rightEyeHeight = this.calculateEyeHeight(points, 43, 47);

      const eyeRatio = leftEyeHeight / rightEyeHeight;
      if (eyeRatio < 0.5) customExpressions.leftEyeWink = 0.8;
      if (eyeRatio > 2.0) customExpressions.rightEyeWink = 0.8;

      // Sorrir lado esquerdo/direito
      const smileAsymmetry = this.calculateSmileAsymmetry(points);
      if (smileAsymmetry.leftDominant)
        customExpressions.leftSmile = smileAsymmetry.confidence;
      if (smileAsymmetry.rightDominant)
        customExpressions.rightSmile = smileAsymmetry.confidence;

      // Franzir testa
      const browFrown = this.calculateBrowFrown(points);
      if (browFrown.confidence > 0.6)
        customExpressions.frownBrow = browFrown.confidence;

      // Boca aberta
      const mouthOpen = this.calculateMouthOpen(points);
      if (mouthOpen.confidence > 0.7)
        customExpressions.mouthOpen = mouthOpen.confidence;
    } catch (e) {
      console.log("Erro ao detectar expressões customizadas:", e);
    }

    return customExpressions;
  }

  /**
   * Calcula a altura do olho entre dois pontos
   */
  calculateEyeHeight(points, topIndex, bottomIndex) {
    return Math.abs(points[bottomIndex].y - points[topIndex].y);
  }

  /**
   * Calcula assimetria do sorriso
   */
  calculateSmileAsymmetry(points) {
    const leftMouth = points[48];
    const rightMouth = points[54];
    const centerMouth = points[51];

    const leftSmileHeight = Math.abs(centerMouth.y - leftMouth.y);
    const rightSmileHeight = Math.abs(centerMouth.y - rightMouth.y);

    const ratio = leftSmileHeight / rightSmileHeight;

    return {
      leftDominant: ratio > 1.3,
      rightDominant: ratio < 0.7,
      confidence: Math.min(Math.abs(ratio - 1) * 0.7, 0.9),
    };
  }

  /**
   * Calcula franzir de sobrancelha
   */
  calculateBrowFrown(points) {
    const eyebrowCenter = points[27];
    const noseTop = points[19];
    const browsDistance = Math.abs(eyebrowCenter.y - noseTop.y);

    return {
      confidence: browsDistance < 25 ? 0.8 : 0,
    };
  }

  /**
   * Calcula abertura da boca
   */
  calculateMouthOpen(points) {
    const mouthTop = points[51];
    const mouthBottom = points[57];
    const mouthHeight = Math.abs(mouthBottom.y - mouthTop.y);

    return {
      confidence: mouthHeight > 15 ? Math.min(mouthHeight / 20, 0.9) : 0,
    };
  }

  /**
   * Processa expressões em tempo real com sistema de hold time individual
   */
  processExpressions(basicExpressions, landmarks) {
    const basic = this.detectBasicExpressions(basicExpressions);
    const custom = this.detectCustomExpressions(landmarks);

    // Encontrar a expressão com maior confiança
    let bestExpression = {
      key: basic.expression,
      confidence: basic.confidence,
    };

    for (const [key, confidence] of Object.entries(custom)) {
      if (confidence > bestExpression.confidence && confidence > 0.4) {
        bestExpression = { key, confidence };
      }
    }

    const expressionConfig = this.expressions[bestExpression.key];
    const currentTime = Date.now();

    // Sistema de hold time individual para cada expressão
    if (
      bestExpression.confidence > this.confidenceThreshold &&
      expressionConfig?.enabled
    ) {
      const state = this.expressionStates.get(bestExpression.key) || {
        startTime: null,
        lastTrigger: 0,
      };

      if (!state.startTime) {
        state.startTime = currentTime;
        this.expressionStates.set(bestExpression.key, state);
      }

      const holdDuration = (currentTime - state.startTime) / 1000;
      const requiredHoldTime = expressionConfig.holdTime || 2.0;

      if (holdDuration >= requiredHoldTime) {
        // Cooldown entre comandos da mesma expressão (3 segundos)
        if (currentTime - state.lastTrigger > 3000) {
          state.lastTrigger = currentTime;
          state.startTime = null;
          this.expressionStates.set(bestExpression.key, state);

          return {
            triggered: true,
            expression: bestExpression.key,
            config: expressionConfig,
            confidence: bestExpression.confidence,
            progress: 100,
          };
        }
      }

      return {
        triggered: false,
        expression: bestExpression.key,
        config: expressionConfig,
        confidence: bestExpression.confidence,
        progress: Math.min((holdDuration / requiredHoldTime) * 100, 100),
      };
    } else {
      // Limpar estado se expressão não detectada
      this.expressionStates.delete(bestExpression.key);

      return {
        triggered: false,
        expression: bestExpression.key,
        config: expressionConfig,
        confidence: bestExpression.confidence,
        progress: 0,
      };
    }
  }

  /**
   * Obtém nome de exibição da expressão
   */
  getExpressionDisplayName(expression) {
    return this.expressions[expression]?.name || "😐 Neutro";
  }

  /**
   * Carrega configuração de expressões do localStorage
   */
  loadExpressionConfig() {
    const saved = localStorage.getItem("expressionConfig");
    if (saved) {
      try {
        return { ...this.defaultExpressions, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Erro ao carregar configuração:", e);
      }
    }
    return { ...this.defaultExpressions };
  }

  /**
   * Salva configuração de expressões no localStorage
   */
  saveExpressionConfig() {
    localStorage.setItem("expressionConfig", JSON.stringify(this.expressions));
  }

  /**
   * Atualiza configuração de uma expressão
   */
  updateExpression(key, updates) {
    if (this.expressions[key]) {
      this.expressions[key] = { ...this.expressions[key], ...updates };
      this.saveExpressionConfig();
    }
  }

  /**
   * Remove uma expressão (agora permite remover padrão também)
   */
  removeExpression(key) {
    if (this.expressions[key]) {
      delete this.expressions[key];
      this.expressionStates.delete(key);
      this.saveExpressionConfig();
      return true;
    }
    return false;
  }

  /**
   * Adiciona nova expressão customizada
   */
  addCustomExpression(name, command, holdTime = 2.0) {
    const key = `custom_${Date.now()}`;
    this.expressions[key] = {
      name,
      command,
      enabled: true,
      holdTime,
    };
    this.saveExpressionConfig();
    return key;
  }

  /**
   * Reseta configurações para padrão
   */
  resetToDefault() {
    this.expressions = { ...this.defaultExpressions };
    this.expressionStates.clear();
    localStorage.removeItem("expressionConfig");
  }

  /**
   * Obtém lista de expressões ativas
   */
  getActiveExpressions() {
    return Object.entries(this.expressions)
      .filter(([key, config]) => config.enabled)
      .map(([key, config]) => ({ key, ...config }));
  }

  /**
   * Obtém todas as expressões
   */
  getAllExpressions() {
    return Object.entries(this.expressions).map(([key, config]) => ({
      key,
      ...config,
      isDefault: !!this.defaultExpressions[key],
    }));
  }
}

// Exportar para uso global
window.FacialExpressionEngine = FacialExpressionEngine;
