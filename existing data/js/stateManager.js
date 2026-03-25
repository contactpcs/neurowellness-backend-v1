/**
 * =============================================
 * STATE MANAGER
 * Centralized state management for PRS application
 * =============================================
 */

const STORAGE_KEY = 'prs_session_state';

/**
 * Initial state structure
 */
const initialState = {
    // Session identification
    patient_id: '',
    patient_name: '',
    session_start: null,
    
    // Multiple conditions support
    // conditions: [{id, label, scales: [...]}]
    conditions: [],
    
    // Legacy single condition (for backward compat)
    condition: '',
    conditionLabel: '',
    
    // Merged unique scale order from all conditions
    scaleOrder: [],
    
    // Current position in the assessment
    currentScaleIndex: 0,
    currentQuestionIndex: 0,
    
    // Highest scale index ever reached (for navigation)
    highestScaleIndex: 0,
    
    // Responses stored per scale: { "PHQ-9": { 1: 2, 2: 1, ... }, ... }
    responses: {},
    
    // Calculated scores per scale
    scores: {},
    
    // Skipped scales (array of scale IDs)
    skippedScales: [],
    
    // Risk flags detected during assessment
    riskFlags: [],
    
    // Settings
    settings: {
        autoSave: true,
        showQuestionNumbers: true
    }
};

/**
 * Current state object
 */
let state = { ...initialState };

/**
 * State change listeners
 */
const listeners = new Set();

/**
 * Generate a random UUID for patient identification
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Initialize a new session
 * Clears any existing state and creates fresh session
 */
export function initSession() {
    // First clear any existing localStorage data
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear previous session:', error);
    }
    
    // Create fresh state
    state = {
        ...initialState,
        patient_id: generateUUID(),
        patient_name: '',
        session_start: new Date().toISOString(),
        conditions: [],
        responses: {},
        scores: {},
        skippedScales: [],
        riskFlags: [],
        highestScaleIndex: 0,
        settings: { ...initialState.settings }
    };
    saveToLocalStorage();
    notifyListeners();
    return state;
}

/**
 * Skip a scale (mark it as skipped, no scoring)
 * @param {string} scaleId - Scale identifier
 */
export function skipScale(scaleId) {
    const skippedScales = [...(state.skippedScales || [])];
    if (!skippedScales.includes(scaleId)) {
        skippedScales.push(scaleId);
    }
    // Remove any existing responses/scores for this scale
    const responses = { ...state.responses };
    const scores = { ...state.scores };
    delete responses[scaleId];
    delete scores[scaleId];
    
    updateState({ skippedScales, responses, scores });
    console.log(`StateManager: Skipped scale ${scaleId}`);
}

/**
 * Unskip a scale (remove from skipped list)
 * @param {string} scaleId - Scale identifier
 */
export function unskipScale(scaleId) {
    const skippedScales = (state.skippedScales || []).filter(id => id !== scaleId);
    updateState({ skippedScales });
}

/**
 * Check if a scale is skipped
 * @param {string} scaleId - Scale identifier
 * @returns {boolean}
 */
export function isScaleSkipped(scaleId) {
    return (state.skippedScales || []).includes(scaleId);
}

/**
 * Get list of skipped scales
 * @returns {Array}
 */
export function getSkippedScales() {
    return [...(state.skippedScales || [])];
}

/**
 * Set patient information
 * @param {string} patientId - The generated patient ID (PAT_XXXXXXXXXX)
 * @param {string} patientName - The patient's name
 */
export function setPatientInfo(patientId, patientName) {
    updateState({
        patient_id: patientId,
        patient_name: patientName
    });
}

/**
 * Get current state
 */
export function getState() {
    return { ...state };
}

/**
 * Update state with partial updates
 * @param {Object} updates - Partial state updates
 */
export function updateState(updates) {
    state = { ...state, ...updates };
    if (state.settings.autoSave) {
        saveToLocalStorage();
    }
    notifyListeners();
}

/**
 * Set the selected condition and its scale order
 * @param {string} conditionId - Condition identifier
 * @param {string} conditionLabel - Human-readable condition name
 * @param {Array} scales - Ordered array of scale IDs for this condition
 */
export function setCondition(conditionId, conditionLabel, scales) {
    // Clear existing and set single condition (fresh start)
    updateState({
        conditions: [{ id: conditionId, label: conditionLabel, scales: scales }],
        condition: conditionId,
        conditionLabel: conditionLabel,
        scaleOrder: scales,
        currentScaleIndex: 0,
        currentQuestionIndex: 0,
        highestScaleIndex: 0,
        responses: {},
        scores: {},
        skippedScales: [],
        riskFlags: []
    });
}

/**
 * Add another condition to existing session
 * Merges new scales with existing, skipping already-completed scales
 * @param {string} conditionId - Condition identifier
 * @param {string} conditionLabel - Human-readable condition name
 * @param {Array} newScales - Scales for this condition
 */
export function addCondition(conditionId, conditionLabel, newScales) {
    const conditions = [...(state.conditions || [])];
    
    // Check if this condition is already added
    if (conditions.some(c => c.id === conditionId)) {
        console.log(`StateManager: Condition ${conditionId} already exists`);
        return;
    }
    
    // Add the new condition
    conditions.push({ id: conditionId, label: conditionLabel, scales: newScales });
    
    // Merge scales - add only new unique scales
    const existingScales = state.scaleOrder || [];
    const mergedScales = [...existingScales];
    
    newScales.forEach(scaleId => {
        if (!mergedScales.includes(scaleId)) {
            mergedScales.push(scaleId);
        }
    });
    
    // Update condition labels (join all)
    const allLabels = conditions.map(c => c.label).join(' + ');
    
    // Find first incomplete scale index
    let firstIncompleteIndex = 0;
    for (let i = 0; i < mergedScales.length; i++) {
        const scaleId = mergedScales[i];
        const hasScore = state.scores && state.scores[scaleId];
        const isSkipped = (state.skippedScales || []).includes(scaleId);
        if (!hasScore && !isSkipped) {
            firstIncompleteIndex = i;
            break;
        }
    }
    
    updateState({
        conditions: conditions,
        condition: conditions.map(c => c.id).join('+'),
        conditionLabel: allLabels,
        scaleOrder: mergedScales,
        currentScaleIndex: firstIncompleteIndex,
        highestScaleIndex: Math.max(state.highestScaleIndex || 0, firstIncompleteIndex)
    });
    
    console.log(`StateManager: Added condition ${conditionId}, merged scales:`, mergedScales);
}

/**
 * Get all selected conditions
 * @returns {Array} Array of condition objects
 */
export function getConditions() {
    return [...(state.conditions || [])];
}

/**
 * Check if a condition is already selected
 * @param {string} conditionId
 * @returns {boolean}
 */
export function hasCondition(conditionId) {
    return (state.conditions || []).some(c => c.id === conditionId);
}

/**
 * Record a response for the current question
 * @param {string} scaleId - Scale identifier
 * @param {number} questionIndex - Question index (0-based)
 * @param {*} value - Response value
 */
export function recordResponse(scaleId, questionIndex, value) {
    const responses = { ...state.responses };
    if (!responses[scaleId]) {
        responses[scaleId] = {};
    }
    responses[scaleId][questionIndex] = value;
    
    // Auto-remove from skipped if user is filling in responses
    let skippedScales = state.skippedScales || [];
    if (skippedScales.includes(scaleId)) {
        skippedScales = skippedScales.filter(id => id !== scaleId);
        console.log(`StateManager: Auto-unskipping ${scaleId} - user is filling responses`);
        updateState({ responses, skippedScales });
    } else {
        updateState({ responses });
    }
}

/**
 * Get response for a specific question
 * @param {string} scaleId - Scale identifier
 * @param {number} questionIndex - Question index
 * @returns {*} Response value or undefined
 */
export function getResponse(scaleId, questionIndex) {
    return state.responses[scaleId]?.[questionIndex];
}

/**
 * Get all responses for a scale
 * @param {string} scaleId - Scale identifier
 * @returns {Object} All responses for the scale { questionIndex: value, ... }
 */
export function getScaleResponses(scaleId) {
    return state.responses[scaleId] || {};
}

/**
 * Check if all questions for a scale are answered
 * @param {string} scaleId - Scale identifier
 * @param {number} totalQuestions - Total number of questions
 * @returns {boolean}
 */
export function isScaleComplete(scaleId, totalQuestions) {
    const scaleResponses = state.responses[scaleId];
    if (!scaleResponses) return false;
    
    const answeredCount = Object.keys(scaleResponses).length;
    return answeredCount >= totalQuestions;
}

/**
 * Store calculated score for a scale
 * @param {string} scaleId - Scale identifier
 * @param {Object} scoreData - Score data including total, severity, subscales, etc.
 */
export function storeScore(scaleId, scoreData) {
    // Validate that this scale is in current session
    if (!state.scaleOrder.includes(scaleId)) {
        console.warn(`StateManager: Refusing to store score for ${scaleId} - not in current session's scaleOrder`);
        return;
    }
    
    const scores = { ...state.scores };
    scores[scaleId] = scoreData;
    updateState({ scores });
    console.log(`StateManager: Stored score for ${scaleId}`, { totalScales: Object.keys(scores).length });
}

/**
 * Add a risk flag
 * @param {Object} flag - Risk flag object { type, severity, message, source }
 */
export function addRiskFlag(flag) {
    const riskFlags = [...state.riskFlags];
    // Avoid duplicates
    const exists = riskFlags.some(f => f.type === flag.type && f.source === flag.source);
    if (!exists) {
        riskFlags.push(flag);
        updateState({ riskFlags });
    }
}

/**
 * Navigate to next question or scale
 */
export function navigateNext() {
    updateState({
        currentQuestionIndex: state.currentQuestionIndex + 1
    });
}

/**
 * Navigate to previous question
 */
export function navigatePrevious() {
    if (state.currentQuestionIndex > 0) {
        updateState({
            currentQuestionIndex: state.currentQuestionIndex - 1
        });
    }
}

/**
 * Move to next scale
 */
export function moveToNextScale() {
    const nextIndex = state.currentScaleIndex + 1;
    const newHighest = Math.max(state.highestScaleIndex || 0, nextIndex);
    updateState({
        currentScaleIndex: nextIndex,
        currentQuestionIndex: 0,
        highestScaleIndex: newHighest
    });
}

/**
 * Check if we're on the last scale
 * @returns {boolean}
 */
export function isLastScale() {
    return state.currentScaleIndex >= state.scaleOrder.length - 1;
}

/**
 * Update settings
 * @param {Object} settings - Settings updates
 */
export function updateSettings(settings) {
    updateState({
        settings: { ...state.settings, ...settings }
    });
}

/**
 * Save state to localStorage
 */
function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('Failed to save state to localStorage:', error);
    }
}

/**
 * Load state from localStorage
 * @returns {boolean} True if state was restored
 */
export function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...initialState, ...parsed };
            notifyListeners();
            return true;
        }
    } catch (error) {
        console.warn('Failed to load state from localStorage:', error);
    }
    return false;
}

/**
 * Clear saved state
 */
export function clearSavedState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear localStorage:', error);
    }
}

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Notify all listeners of state change
 */
function notifyListeners() {
    listeners.forEach(listener => {
        try {
            listener(state);
        } catch (error) {
            console.error('Listener error:', error);
        }
    });
}

/**
 * Get all responses for report generation
 * @returns {Object} All responses
 */
export function getAllResponses() {
    return { ...state.responses };
}

/**
 * Get all scores for report generation
 * Only returns scores for scales in the current session's scaleOrder
 * Excludes skipped scales
 * @returns {Object} All scores
 */
export function getAllScores() {
    // Filter to only include scores for non-skipped scales in current session
    const validScores = {};
    const scaleOrder = state.scaleOrder || [];
    const skippedScales = state.skippedScales || [];
    
    Object.keys(state.scores).forEach(scaleId => {
        // Only include if scale is in current session's order AND not skipped
        if (scaleOrder.includes(scaleId) && !skippedScales.includes(scaleId)) {
            validScores[scaleId] = state.scores[scaleId];
        }
    });
    
    return validScores;
}

/**
 * Get all risk flags
 * @returns {Array} Risk flags
 */
export function getRiskFlags() {
    return [...state.riskFlags];
}

// Export state manager as default
export default {
    initSession,
    getState,
    updateState,
    setCondition,
    addCondition,
    getConditions,
    hasCondition,
    recordResponse,
    getResponse,
    isScaleComplete,
    storeScore,
    addRiskFlag,
    navigateNext,
    navigatePrevious,
    moveToNextScale,
    isLastScale,
    updateSettings,
    loadFromLocalStorage,
    clearSavedState,
    subscribe,
    getAllResponses,
    getAllScores,
    getRiskFlags,
    skipScale,
    unskipScale,
    isScaleSkipped,
    getSkippedScales,
    getScaleResponses
};
