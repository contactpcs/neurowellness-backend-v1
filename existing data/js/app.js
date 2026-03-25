/**
 * =============================================
 * PRS MAIN APPLICATION
 * Main controller for the Patient Rating System
 * =============================================
 */

import * as StateManager from './stateManager.js';
import * as ScaleEngine from './scaleEngine.js';
import * as PDFGenerator from './pdfGenerator.js';

// ========================================
// APPLICATION STATE
// ========================================

let conditionMap = {};
let currentScale = null;
let scales = {};  // Cache loaded scales
let isAddConditionMode = false;  // Track if adding condition to existing session

// ========================================
// DOM ELEMENT REFERENCES
// ========================================

const elements = {
    // Screens
    screenPatient: document.getElementById('screenPatient'),
    screenCondition: document.getElementById('screenCondition'),
    screenAssessment: document.getElementById('screenAssessment'),
    screenResults: document.getElementById('screenResults'),
    
    // Patient Entry
    patientName: document.getElementById('patientName'),
    patientIdPreview: document.getElementById('patientIdPreview'),
    generatedPatientId: document.getElementById('generatedPatientId'),
    btnProceedToCondition: document.getElementById('btnProceedToCondition'),
    
    // Condition Selection (New Grid)
    displayPatientName: document.getElementById('displayPatientName'),
    displayPatientId: document.getElementById('displayPatientId'),
    conditionGrid: document.getElementById('conditionGrid'),
    selectedConditionPanel: document.getElementById('selectedConditionPanel'),
    selectedConditionName: document.getElementById('selectedConditionName'),
    selectedConditionDesc: document.getElementById('selectedConditionDesc'),
    scaleCount: document.getElementById('scaleCount'),
    scaleList: document.getElementById('scaleList'),
    btnChangeCondition: document.getElementById('btnChangeCondition'),
    btnStartAssessment: document.getElementById('btnStartAssessment'),
    
    // Assessment - New Layout
    scaleNavList: document.getElementById('scaleNavList'),
    progressPercent: document.getElementById('progressPercent'),
    currentScaleNumber: document.getElementById('currentScaleNumber'),
    totalScales: document.getElementById('totalScales'),
    scaleTitle: document.getElementById('scaleTitle'),
    scaleDescription: document.getElementById('scaleDescription'),
    categoryTag: document.getElementById('categoryTag'),
    recallPeriod: document.getElementById('recallPeriod'),
    scoringInfo: document.getElementById('scoringInfo'),
    estimatedTime: document.getElementById('estimatedTime'),
    answeredCount: document.getElementById('answeredCount'),
    totalQuestions: document.getElementById('totalQuestions'),
    scaleInstructions: document.getElementById('scaleInstructions'),
    questionsContainer: document.getElementById('questionsContainer'),
    completionStatus: document.getElementById('completionStatus'),
    btnPrevQuestion: document.getElementById('btnPrevQuestion'),
    btnNextQuestion: document.getElementById('btnNextQuestion'),
    btnDevPrefill: document.getElementById('btnDevPrefill'),
    validationMessage: document.getElementById('validationMessage'),
    
    // Mobile sidebar toggle
    btnMobileProgress: document.getElementById('btnMobileProgress'),
    mobileProgressBadge: document.getElementById('mobileProgressBadge'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    scaleSidebar: document.querySelector('.scale-sidebar'),
    
    // Results
    resultPatientId: document.getElementById('resultPatientId'),
    resultDate: document.getElementById('resultDate'),
    resultCondition: document.getElementById('resultCondition'),
    riskFlagsCard: document.getElementById('riskFlagsCard'),
    riskFlagsContent: document.getElementById('riskFlagsContent'),
    scaleResults: document.getElementById('scaleResults'),
    compositeSummary: document.getElementById('compositeSummary'),
    btnViewReport: document.getElementById('btnViewReport'),
    btnDownloadPDF: document.getElementById('btnDownloadPDF'),
    btnDownloadCSV: document.getElementById('btnDownloadCSV'),
    btnNewAssessment: document.getElementById('btnNewAssessment'),
    btnEditResponses: document.getElementById('btnEditResponses'),
    btnAddCondition: document.getElementById('btnAddCondition'),
    
    // Header Menu
    btnHeaderMenu: document.getElementById('btnHeaderMenu'),
    headerDropdown: document.getElementById('headerDropdown'),
    btnMenuNewAssessment: document.getElementById('btnMenuNewAssessment'),
    btnMenuSettings: document.getElementById('btnMenuSettings'),
    
    // Assessment Actions
    btnSkipScale: document.getElementById('btnSkipScale'),
    
    // Settings Modal
    modalSettings: document.getElementById('modalSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    settingAutoSave: document.getElementById('settingAutoSave'),
    settingShowNumbers: document.getElementById('settingShowNumbers'),
    
    // Completion Modal
    modalCompletion: document.getElementById('modalCompletion'),
    completionSummary: document.getElementById('completionSummary'),
    btnCompletionBack: document.getElementById('btnCompletionBack'),
    btnCompletionConfirm: document.getElementById('btnCompletionConfirm'),
    
    // Loading Overlay
    loadingOverlay: document.getElementById('loadingOverlay')
};

// ========================================
// INITIALIZATION
// ========================================

/**
 * Initialize the application
 */
async function init() {
    console.log('PRS Application Initializing...');
    
    // Load condition map
    await loadConditionMap();
    
    // Setup event listeners FIRST (before showing any screen)
    setupEventListeners();
    
    // Try to restore existing session from localStorage
    const hasExistingSession = StateManager.loadFromLocalStorage();
    
    if (hasExistingSession) {
        const state = StateManager.getState();
        console.log('Restored existing session:', state.patient_id);
        
        // Restore to appropriate screen based on state
        await restoreSession(state);
    } else {
        // No existing session - start fresh
        StateManager.initSession();
        showScreen('patient');
    }
    
    console.log('PRS Application Ready');
}

/**
 * Restore session to appropriate screen
 */
async function restoreSession(state) {
    // If we have scores, go to results screen
    if (Object.keys(state.scores || {}).length > 0 && 
        Object.keys(state.scores).length >= (state.scaleOrder?.length || 0)) {
        // All scales completed - show results
        await loadAllScalesForResults();
        showResults();
    } 
    // If we have a condition selected and started assessment
    else if (state.condition && state.scaleOrder?.length > 0) {
        // Resume assessment
        await loadCurrentScaleAndResume();
    }
    // If we have patient info but no condition
    else if (state.patient_name) {
        // Show condition selection
        elements.displayPatientName.textContent = state.patient_name;
        elements.displayPatientId.textContent = state.patient_id;
        showScreen('condition');
    }
    // Otherwise start fresh
    else {
        showScreen('patient');
    }
}

/**
 * Load all scales for results display
 */
async function loadAllScalesForResults() {
    const state = StateManager.getState();
    for (const scaleId of state.scaleOrder || []) {
        if (!scales[scaleId]) {
            try {
                scales[scaleId] = await loadScale(scaleId);
            } catch (e) {
                console.warn(`Failed to load scale ${scaleId}:`, e);
            }
        }
    }
}

/**
 * Load current scale and resume assessment
 */
async function loadCurrentScaleAndResume() {
    try {
        await loadCurrentScale();
        showScreen('assessment');
    } catch (e) {
        console.error('Failed to resume scale:', e);
        StateManager.initSession();
        showScreen('patient');
    }
}

/**
 * Load condition map from JSON
 */
async function loadConditionMap() {
    try {
        const response = await fetch('data/conditionMap.json');
        conditionMap = await response.json();
        populateConditionGrid();
    } catch (error) {
        console.error('Failed to load condition map:', error);
        showError('Failed to load conditions. Please refresh the page.');
    }
}

/**
 * Generate a patient ID based on name
 * Format: PAT_{first 2-3 letters of name}_{random 6-digit number}
 * @param {string} patientName - The patient's name
 */
function generatePatientId(patientName) {
    // Extract first 2-3 letters from name (only alphabets)
    const letters = patientName.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const prefix = letters.substring(0, Math.min(letters.length, 3));
    
    // Generate random 6-digit number
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    
    return `PAT_${prefix}_${randomNum}`;
}

/**
 * Populate condition grid with cards
 */
function populateConditionGrid() {
    elements.conditionGrid.innerHTML = '';
    
    // Icon mapping for conditions
    const iconMap = {
        'depression-anxiety': 'fa-brain',
        'chronic-pain': 'fa-bone',
        'neuropathic-pain': 'fa-bolt-lightning',
        'autonomic-dysfunction': 'fa-heart-pulse',
        'fibromyalgia': 'fa-person-dots-from-line',
        'migraine': 'fa-head-side-virus',
        'ataxia': 'fa-person-walking-with-cane',
        'stroke-tbi': 'fa-heart-pulse',
        'dementia': 'fa-head-side',
        'parkinsons': 'fa-hands-holding',
        'tinnitus': 'fa-ear-listen',
        'insomnia': 'fa-bed',
        'multiple-sclerosis': 'fa-person-cane',
        'adhd': 'fa-bolt',
        'als': 'fa-wheelchair',
        'ibd': 'fa-stomach',
        'autism': 'fa-puzzle-piece',
        'addiction': 'fa-pills',
        'cognitive-screening': 'fa-brain'
    };
    
    Object.entries(conditionMap.conditions || {}).forEach(([id, condition]) => {
        const icon = iconMap[id] || 'fa-stethoscope';
        const card = document.createElement('div');
        card.className = 'condition-card';
        card.dataset.conditionId = id;
        card.innerHTML = `
            <div class="condition-card-check">
                <i class="fas fa-check"></i>
            </div>
            <div class="condition-card-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="condition-card-title">${condition.label}</div>
            <div class="condition-card-scales">${condition.scales.length} scales</div>
        `;
        
        card.addEventListener('click', () => handleConditionCardClick(id, condition));
        elements.conditionGrid.appendChild(card);
    });
}

/**
 * Load a scale from JSON
 */
async function loadScale(scaleId) {
    // Check cache first
    if (scales[scaleId]) {
        return scales[scaleId];
    }
    
    try {
        const response = await fetch(`data/scales/${scaleId}.json`);
        const scale = await response.json();
        scales[scaleId] = scale;
        return scale;
    } catch (error) {
        console.error(`Failed to load scale ${scaleId}:`, error);
        throw error;
    }
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Patient entry
    elements.patientName.addEventListener('input', handlePatientNameInput);
    elements.btnProceedToCondition.addEventListener('click', handleProceedToCondition);
    
    // Condition selection
    elements.btnChangeCondition.addEventListener('click', handleChangeCondition);
    elements.btnStartAssessment.addEventListener('click', handleStartAssessment);
    
    // Navigation
    elements.btnPrevQuestion.addEventListener('click', handlePreviousQuestion);
    elements.btnNextQuestion.addEventListener('click', handleNextQuestion);
    
    // Dev/Debug prefill button
    if (elements.btnDevPrefill) {
        elements.btnDevPrefill.addEventListener('click', devPrefillCurrentScale);
    }
    
    // Results
    elements.btnViewReport.addEventListener('click', () => window.location.href = 'report-view.html');
    elements.btnDownloadPDF.addEventListener('click', handleDownloadPDF);
    elements.btnDownloadCSV.addEventListener('click', handleDownloadCSV);
    elements.btnNewAssessment.addEventListener('click', handleNewAssessment);
    elements.btnEditResponses.addEventListener('click', handleEditResponses);
    
    // Add another condition
    if (elements.btnAddCondition) {
        elements.btnAddCondition.addEventListener('click', handleAddCondition);
    }
    
    // Skip scale button
    if (elements.btnSkipScale) {
        elements.btnSkipScale.addEventListener('click', handleSkipScale);
    }
    
    // Mobile sidebar toggle
    if (elements.btnMobileProgress) {
        elements.btnMobileProgress.addEventListener('click', toggleMobileSidebar);
    }
    if (elements.sidebarOverlay) {
        elements.sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }
    
    // Header menu
    if (elements.btnHeaderMenu) {
        elements.btnHeaderMenu.addEventListener('click', toggleHeaderMenu);
    }
    if (elements.btnMenuNewAssessment) {
        elements.btnMenuNewAssessment.addEventListener('click', () => {
            hideHeaderMenu();
            handleNewAssessment();
        });
    }
    if (elements.btnMenuSettings) {
        elements.btnMenuSettings.addEventListener('click', () => {
            hideHeaderMenu();
            showModal('settings');
        });
    }
    
    // Close header menu when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.headerDropdown && !elements.headerDropdown.classList.contains('hidden')) {
            if (!elements.btnHeaderMenu.contains(e.target) && !elements.headerDropdown.contains(e.target)) {
                hideHeaderMenu();
            }
        }
    });
    
    // Settings modal
    elements.btnCloseSettings.addEventListener('click', () => hideModal('settings'));
    elements.settingAutoSave.addEventListener('change', handleSettingsChange);
    elements.settingShowNumbers.addEventListener('change', handleSettingsChange);
    
    // Completion modal
    if (elements.btnCompletionBack) {
        elements.btnCompletionBack.addEventListener('click', () => {
            hideModal('completion');
        });
    }
    if (elements.btnCompletionConfirm) {
        elements.btnCompletionConfirm.addEventListener('click', handleConfirmCompletion);
    }
    
    // Close modal on overlay click
    elements.modalSettings.addEventListener('click', (e) => {
        if (e.target === elements.modalSettings) {
            hideModal('settings');
        }
    });
    if (elements.modalCompletion) {
        elements.modalCompletion.addEventListener('click', (e) => {
            if (e.target === elements.modalCompletion) {
                hideModal('completion');
            }
        });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboardNavigation);
    
    // Enter key on patient name input
    elements.patientName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !elements.btnProceedToCondition.disabled) {
            handleProceedToCondition();
        }
    });
}

// ========================================
// EVENT HANDLERS
// ========================================

/**
 * Handle patient name input
 */
let currentPatientId = null;

function handlePatientNameInput(e) {
    const name = e.target.value.trim();
    
    if (name.length >= 2) {
        // Generate patient ID based on name (regenerate each time name changes)
        currentPatientId = generatePatientId(name);
        elements.generatedPatientId.textContent = currentPatientId;
        elements.patientIdPreview.classList.remove('hidden');
        elements.btnProceedToCondition.disabled = false;
    } else {
        currentPatientId = null;
        elements.patientIdPreview.classList.add('hidden');
        elements.btnProceedToCondition.disabled = true;
    }
}

/**
 * Handle proceed to condition selection
 */
function handleProceedToCondition() {
    const patientName = elements.patientName.value.trim();
    
    if (!patientName || !currentPatientId) {
        return;
    }
    
    // Store patient info in state
    StateManager.setPatientInfo(currentPatientId, patientName);
    
    // Update condition screen display
    elements.displayPatientName.textContent = patientName;
    elements.displayPatientId.textContent = currentPatientId;
    
    // Reset add mode (this is a fresh condition selection)
    isAddConditionMode = false;
    
    // Reset condition selection UI
    document.querySelectorAll('.condition-card').forEach(card => {
        card.classList.remove('selected', 'already-selected');
        card.style.opacity = '';
        card.style.pointerEvents = '';
    });
    elements.selectedConditionPanel.classList.add('hidden');
    
    // Update header
    const conditionHeader = document.querySelector('#screenCondition h1');
    if (conditionHeader) {
        conditionHeader.textContent = 'Select Condition';
    }
    
    // Show condition screen
    showScreen('condition');
}

/**
 * Handle condition card click
 */
let selectedConditionId = null;

function handleConditionCardClick(conditionId, condition) {
    // Check if this condition is already selected (in add mode)
    if (isAddConditionMode && StateManager.hasCondition(conditionId)) {
        return; // Don't allow re-selecting same condition
    }
    
    // Remove selection from all cards
    document.querySelectorAll('.condition-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Select clicked card
    const clickedCard = document.querySelector(`[data-condition-id="${conditionId}"]`);
    if (clickedCard) {
        clickedCard.classList.add('selected');
    }
    
    // Store selection
    selectedConditionId = conditionId;
    
    // Update panel info
    elements.selectedConditionName.textContent = condition.label;
    elements.selectedConditionDesc.textContent = condition.description || '';
    
    // In add mode, show which scales are new vs already done
    const state = StateManager.getState();
    const existingScales = state.scaleOrder || [];
    const completedScales = Object.keys(state.scores || {});
    
    let newScalesCount = 0;
    let alreadyDoneCount = 0;
    
    // Populate scale list with status
    elements.scaleList.innerHTML = '';
    condition.scales.forEach(scaleId => {
        const li = document.createElement('li');
        const metadata = conditionMap.scaleMetadata?.[scaleId];
        const isCompleted = completedScales.includes(scaleId);
        
        if (isAddConditionMode && isCompleted) {
            li.innerHTML = `<span style="color: #28a745;">✓</span> ${metadata?.name || scaleId} <small style="color:#6c757d;">(already done)</small>`;
            alreadyDoneCount++;
        } else if (isAddConditionMode && existingScales.includes(scaleId)) {
            li.innerHTML = `<span style="color: #ffc107;">○</span> ${metadata?.name || scaleId} <small style="color:#6c757d;">(pending)</small>`;
        } else {
            li.textContent = metadata?.name || scaleId;
            newScalesCount++;
        }
        elements.scaleList.appendChild(li);
    });
    
    // Update scale count
    if (isAddConditionMode) {
        elements.scaleCount.textContent = `${condition.scales.length} (${newScalesCount} new)`;
    } else {
        elements.scaleCount.textContent = condition.scales.length;
    }
    
    // Show panel
    elements.selectedConditionPanel.classList.remove('hidden');
    
    // Scroll panel into view
    elements.selectedConditionPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Only set condition immediately if NOT in add mode
    // In add mode, wait for Start Assessment button click
    if (!isAddConditionMode) {
        StateManager.setCondition(conditionId, condition.label, condition.scales);
    }
}

/**
 * Handle change condition button
 */
function handleChangeCondition() {
    // Remove selection from all cards
    document.querySelectorAll('.condition-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Hide panel
    elements.selectedConditionPanel.classList.add('hidden');
    selectedConditionId = null;
}
/**
 * Handle start assessment button click
 */
async function handleStartAssessment() {
    const state = StateManager.getState();
    
    // In add mode, apply the new condition
    if (isAddConditionMode) {
        if (!selectedConditionId) {
            showError('Please select a condition first.');
            return;
        }
        
        const condition = conditionMap.conditions[selectedConditionId];
        if (!condition) {
            showError('Invalid condition selected.');
            return;
        }
        
        // Add the new condition (merges scales)
        StateManager.addCondition(selectedConditionId, condition.label, condition.scales);
        
        // Reset add mode flag
        isAddConditionMode = false;
        
        console.log('Added condition, starting assessment with merged scales');
    }
    
    // Verify we have a condition set
    const updatedState = StateManager.getState();
    if (!updatedState.condition || updatedState.scaleOrder.length === 0) {
        showError('Please select a condition first.');
        return;
    }
    
    // Load the current scale (will be first incomplete scale in add mode)
    try {
        await loadCurrentScale();
        showScreen('assessment');
    } catch (error) {
        console.error('Failed to load assessment:', error);
        showError('Failed to load assessment. Please try again.');
    }
}

/**
 * Load and prepare current scale - renders ALL questions at once
 */
async function loadCurrentScale() {
    console.log('loadCurrentScale: Starting...');
    const state = StateManager.getState();
    console.log('loadCurrentScale: State:', state);
    const scaleId = state.scaleOrder[state.currentScaleIndex];
    console.log('loadCurrentScale: Loading scale:', scaleId);
    
    currentScale = await loadScale(scaleId);
    console.log('loadCurrentScale: Scale loaded:', currentScale?.name);
    
    // Update scale navigation sidebar
    renderScaleNavigation();
    console.log('loadCurrentScale: Navigation rendered');
    
    // Update scale header info
    elements.currentScaleNumber.textContent = state.currentScaleIndex + 1;
    elements.totalScales.textContent = `of ${state.scaleOrder.length}`;
    elements.scaleTitle.textContent = currentScale.name;
    elements.scaleDescription.textContent = currentScale.description || '';
    
    // Update category tag
    if (elements.categoryTag) {
        elements.categoryTag.textContent = state.conditionLabel || 'Assessment';
    }
    
    // Meta info
    elements.recallPeriod.textContent = currentScale.recallPeriod || 'Current';
    elements.scoringInfo.textContent = getScoringDescription(currentScale);
    elements.estimatedTime.textContent = currentScale.estimatedTime || currentScale.timeToComplete || '~5 min';
    elements.totalQuestions.textContent = currentScale.questions.length;
    console.log('loadCurrentScale: Header updated');
    
    // Instructions
    if (currentScale.instructions) {
        elements.scaleInstructions.innerHTML = `
            <i class="fas fa-info-circle"></i>
            <p>${currentScale.instructions}</p>
        `;
        elements.scaleInstructions.style.display = 'flex';
    } else {
        elements.scaleInstructions.style.display = 'none';
    }
    
    // Render ALL questions for this scale
    renderAllQuestions();
    console.log('loadCurrentScale: Questions rendered');
    
    // Update progress
    updateProgress();
    console.log('loadCurrentScale: Complete');
}

/**
 * Get scoring description for display
 */
function getScoringDescription(scale) {
    const type = scale.scoringType || 'sum';
    const max = scale.maxScore;
    
    switch (type) {
        case 'sum':
            return `Sum scoring (0-${max || '?'})`;
        case 'subscale-sum':
            return 'Subscale scoring';
        case 'component-sum':
            return `${scale.componentCount || 7} component scoring`;
        case 'profile-and-vas':
            return 'Health profile + VAS';
        case 'weighted-binary':
            return 'Weighted binary scoring';
        case 'clinician':
            return 'Clinician-rated';
        default:
            return max ? `Score range: 0-${max}` : 'Standard scoring';
    }
}

/**
 * Render scale navigation sidebar
 */
function renderScaleNavigation() {
    const state = StateManager.getState();
    const skippedScales = StateManager.getSkippedScales();
    const highestReached = state.highestScaleIndex || 0;
    const existingScores = state.scores || {};
    
    let html = '';
    state.scaleOrder.forEach((scaleId, index) => {
        const scaleMeta = conditionMap.scaleMetadata?.[scaleId] || { name: scaleId };
        const isActive = index === state.currentScaleIndex;
        const responses = StateManager.getScaleResponses(scaleId);
        const answeredCount = Object.keys(responses || {}).length;
        const hasResponses = answeredCount > 0;
        const hasScore = existingScores[scaleId] !== undefined;
        
        // A scale is only "skipped" if it's in the skipped list AND has no responses
        const isSkipped = skippedScales.includes(scaleId) && !hasResponses;
        
        // Completed if: has responses, has score, or index < highestReached
        const isCompleted = hasResponses || hasScore || index < highestReached;
        
        // Clickable if: has score (already done) OR (index < highestReached AND not current)
        const isClickable = (hasScore && index !== state.currentScaleIndex) || 
                           (index < highestReached && index !== state.currentScaleIndex);
        
        let status = 'pending';
        if (isSkipped) status = 'skipped';
        else if (isActive) status = 'active';
        else if (isCompleted && !isActive) status = 'completed';
        
        const icon = isSkipped ? '<i class="fas fa-forward"></i>' : 
                     (status === 'completed' ? '<i class="fas fa-check"></i>' : (index + 1));
        
        html += `
            <div class="scale-nav-item ${status}${isClickable ? ' clickable' : ''}" data-scale-index="${index}" data-scale-id="${scaleId}">
                <div class="nav-item-indicator">
                    ${icon}
                </div>
                <div class="nav-item-content">
                    <span class="nav-item-name">${scaleId}</span>
                    <span class="nav-item-full">${scaleMeta.name}${isSkipped ? ' (Skipped)' : ''}</span>
                </div>
            </div>
        `;
    });
    
    elements.scaleNavList.innerHTML = html;
    
    // Add click handlers only to clickable nav items
    elements.scaleNavList.querySelectorAll('.scale-nav-item.clickable').forEach(item => {
        item.addEventListener('click', () => {
            const targetIndex = parseInt(item.dataset.scaleIndex);
            navigateToScale(targetIndex);
        });
    });
    
    // Update progress percentage
    const completedCount = state.scaleOrder.filter((scaleId) => {
        const responses = StateManager.getScaleResponses(scaleId);
        const hasResponses = Object.keys(responses || {}).length > 0;
        const hasScore = existingScores[scaleId] !== undefined;
        const isSkipped = skippedScales.includes(scaleId) && !hasResponses;
        return hasResponses || hasScore || isSkipped;
    }).length;
    const progress = Math.round((completedCount / state.scaleOrder.length) * 100);
    elements.progressPercent.textContent = `${progress}%`;
    
    // Update mobile progress badge too
    if (elements.mobileProgressBadge) {
        elements.mobileProgressBadge.textContent = `${progress}%`;
    }
}

/**
 * Navigate to a specific scale by index
 */
async function navigateToScale(targetIndex) {
    const state = StateManager.getState();
    const highestReached = state.highestScaleIndex || 0;
    const scaleId = state.scaleOrder[targetIndex];
    const hasScore = state.scores && state.scores[scaleId];
    
    if (targetIndex < 0 || targetIndex >= state.scaleOrder.length) return;
    if (targetIndex === state.currentScaleIndex) return;
    
    // Can navigate to: scales with scores, or scales index < highestReached
    const canNavigate = hasScore || targetIndex < highestReached;
    if (!canNavigate) {
        console.log('Cannot navigate to scale not yet reached');
        return;
    }
    
    // Close mobile sidebar if open
    closeMobileSidebar();
    
    // Update state to target scale
    StateManager.updateState({ currentScaleIndex: targetIndex });
    
    // Load and render the scale
    await loadCurrentScale();
}

/**
 * Render ALL questions for current scale
 */
function renderAllQuestions() {
    const state = StateManager.getState();
    const scaleId = state.scaleOrder[state.currentScaleIndex];
    const showNumbers = state.settings.showQuestionNumbers;
    
    let html = '';
    let currentGroup = null;
    let currentSection = null;
    
    currentScale.questions.forEach((question, index) => {
        const savedResponse = StateManager.getResponse(scaleId, index);
        const isAnswered = savedResponse !== undefined && savedResponse !== null && savedResponse !== '';
        
        // Section header with instructions (for scales like FIQR)
        if (question.section && question.section !== currentSection) {
            currentSection = question.section;
            const sectionConfig = currentScale.sections?.find(s => s.id === question.section);
            if (sectionConfig) {
                html += `
                    <div class="section-header">
                        <h3 class="section-title">${sectionConfig.name || question.section}</h3>
                        ${sectionConfig.instruction ? `<p class="section-instruction">${sectionConfig.instruction}</p>` : ''}
                    </div>
                `;
            }
        }
        
        // Group header if applicable (legacy support)
        if (question.groupLabel && question.group !== currentGroup) {
            currentGroup = question.group;
            html += `<div class="question-group-header">${question.groupLabel}</div>`;
        }
        
        // Get question text
        const questionText = question.question || question.text || question.label || 'Question';
        
        html += `
            <div class="question-card ${isAnswered ? 'answered' : ''}" data-question-index="${index}" id="question-${index}">
                <div class="question-header">
                    ${showNumbers ? `<span class="question-number">${index + 1}</span>` : ''}
                    <span class="question-text">${questionText}</span>
                    ${isAnswered ? '<i class="fas fa-check-circle answered-icon"></i>' : ''}
                </div>
                <div class="question-options">
                    ${renderQuestionOptions(question, savedResponse, scaleId, index)}
                </div>
            </div>
        `;
    });
    
    elements.questionsContainer.innerHTML = html;
    
    // Attach all event handlers
    attachAllHandlers();
    
    // Update answered count
    updateAnsweredCount();
}

/**
 * Render question options based on type
 */
function renderQuestionOptions(question, savedResponse, scaleId, questionIndex) {
    switch (question.type) {
        case 'time':
            return renderTimeInput(question, savedResponse, questionIndex);
        case 'number':
        case 'numeric':
            return renderNumberInput(question, savedResponse, questionIndex);
        case 'text':
            return renderTextInput(question, savedResponse, questionIndex);
        case 'visual-analogue-scale':
        case 'vas':
            return renderVASInput(question, savedResponse, questionIndex);
        default:
            return renderOptionsGrid(question, savedResponse, scaleId, questionIndex);
    }
}

/**
 * Render options as a horizontal grid
 */
function renderOptionsGrid(question, savedResponse, scaleId, questionIndex) {
    if (!question.options) return '';
    
    const isCompact = question.options.length <= 5;
    
    let html = `<div class="options-grid ${isCompact ? 'compact' : 'expanded'}">`;
    
    question.options.forEach((option, optIndex) => {
        const value = option.value !== undefined ? option.value : optIndex;
        const label = option.label || option;
        const isSelected = savedResponse !== undefined && savedResponse == value;
        const points = option.points !== undefined ? option.points : value;
        
        html += `
            <label class="option-card ${isSelected ? 'selected' : ''}" data-value="${value}" data-question="${questionIndex}">
                <input type="radio" name="q${questionIndex}" value="${value}" ${isSelected ? 'checked' : ''}>
                <span class="option-label">${label}</span>
                ${currentScale.isClinician !== true && question.showScore !== false ? 
                    `<span class="option-score">${points}</span>` : ''}
            </label>
        `;
    });
    
    html += '</div>';
    return html;
}

/**
 * Attach event handlers for all questions
 */
function attachAllHandlers() {
    const state = StateManager.getState();
    const scaleId = state.scaleOrder[state.currentScaleIndex];
    
    // Option cards (radio buttons)
    document.querySelectorAll('.option-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const questionIndex = parseInt(card.dataset.question);
            const value = card.dataset.value;
            
            // Update visual selection
            const questionCard = card.closest('.question-card');
            questionCard.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            card.querySelector('input').checked = true;
            
            // Mark question as answered
            questionCard.classList.add('answered');
            const answeredIcon = questionCard.querySelector('.answered-icon');
            if (!answeredIcon) {
                questionCard.querySelector('.question-header').insertAdjacentHTML('beforeend', 
                    '<i class="fas fa-check-circle answered-icon"></i>');
            }
            
            // Record response
            StateManager.recordResponse(scaleId, questionIndex, value);
            
            // Update count
            updateAnsweredCount();
        });
    });
    
    // Text/number/select inputs (general question-input class)
    document.querySelectorAll('.question-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const questionIndex = parseInt(input.dataset.question);
            const value = input.value;
            
            const questionCard = input.closest('.question-card');
            if (value) {
                questionCard.classList.add('answered');
            } else {
                questionCard.classList.remove('answered');
            }
            
            StateManager.recordResponse(scaleId, questionIndex, value);
            updateAnsweredCount();
        });
    });
    
    // Time dropdowns (hour, minute, period combined)
    document.querySelectorAll('.time-dropdown-container').forEach(container => {
        const hourSelect = container.querySelector('.time-hour');
        const minuteSelect = container.querySelector('.time-minute');
        const periodSelect = container.querySelector('.time-period');
        
        const updateTimeValue = () => {
            const questionIndex = parseInt(hourSelect.dataset.question);
            const hour = hourSelect.value;
            const minute = minuteSelect.value;
            const period = periodSelect.value;
            
            const questionCard = container.closest('.question-card');
            
            if (hour && minute) {
                const timeValue = `${hour}:${minute} ${period}`;
                questionCard.classList.add('answered');
                StateManager.recordResponse(scaleId, questionIndex, timeValue);
            } else {
                questionCard.classList.remove('answered');
            }
            updateAnsweredCount();
        };
        
        hourSelect.addEventListener('change', updateTimeValue);
        minuteSelect.addEventListener('change', updateTimeValue);
        periodSelect.addEventListener('change', updateTimeValue);
    });
    
    // VAS sliders
    document.querySelectorAll('.vas-input').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const questionIndex = parseInt(slider.dataset.question);
            const value = slider.value;
            
            // Update display
            const display = slider.parentElement.querySelector('.vas-value');
            if (display) display.textContent = value;
            
            const questionCard = slider.closest('.question-card');
            questionCard.classList.add('answered');
            
            StateManager.recordResponse(scaleId, questionIndex, value);
            updateAnsweredCount();
        });
    });
}

/**
 * Update answered question count
 */
function updateAnsweredCount() {
    const state = StateManager.getState();
    const scaleId = state.scaleOrder[state.currentScaleIndex];
    const responses = StateManager.getScaleResponses(scaleId);
    const answeredCount = Object.keys(responses || {}).length;
    const totalQuestions = currentScale.questions.length;
    
    elements.answeredCount.textContent = answeredCount;
    
    // Update completion status
    if (answeredCount >= totalQuestions) {
        elements.completionStatus.innerHTML = `
            <span class="status-complete"><i class="fas fa-check-circle"></i> All questions answered</span>
        `;
        elements.btnNextQuestion.classList.remove('btn-disabled');
    } else {
        elements.completionStatus.innerHTML = `
            <span class="status-incomplete"><i class="fas fa-exclamation-circle"></i> ${totalQuestions - answeredCount} questions remaining</span>
        `;
    }
    
    // Update sidebar progress
    renderScaleNavigation();
}

/**
 * Update overall progress
 */
function updateProgress() {
    const state = StateManager.getState();
    const progress = Math.round((state.currentScaleIndex / state.scaleOrder.length) * 100);
    elements.progressPercent.textContent = `${progress}%`;
    
    updateNavigationButtons();
}

/**
 * Render the current question
 */
function renderCurrentQuestion() {
    const state = StateManager.getState();
    const question = currentScale.questions[state.currentQuestionIndex];
    
    if (!question) {
        console.error('Question not found');
        return;
    }
    
    const showNumbers = state.settings.showQuestionNumbers;
    const scaleId = state.scaleOrder[state.currentScaleIndex];
    const savedResponse = StateManager.getResponse(scaleId, state.currentQuestionIndex);
    
    // Determine question text - check 'question', 'text', and 'label' fields
    const questionText = question.question || question.text || question.label || 'Question text not available';
    
    // Check if this is part of a group and if it's the first in the group
    let groupHeader = '';
    if (question.groupLabel) {
        const prevQuestion = currentScale.questions[state.currentQuestionIndex - 1];
        if (!prevQuestion || prevQuestion.group !== question.group) {
            groupHeader = `<div class="question-group-label">${question.groupLabel}</div>`;
        }
    }
    
    let html = `
        ${groupHeader}
        <div class="question-text">
            ${showNumbers ? `<span class="question-number">${state.currentQuestionIndex + 1}</span>` : ''}
            ${questionText}
        </div>
    `;
    
    // Render based on question type
    switch (question.type) {
        case 'time':
            html += renderTimeInput(question, savedResponse);
            break;
        case 'number':
        case 'numeric':
            html += renderNumberInput(question, savedResponse);
            break;
        case 'text':
            html += renderTextInput(question, savedResponse);
            break;
        case 'visual-analogue-scale':
        case 'vas':
            html += renderVASInput(question, savedResponse);
            break;
        case 'likert-with-text':
            html += renderLikertWithText(question, savedResponse, scaleId, state.currentQuestionIndex);
            break;
        default:
            // Default: likert, single-choice, binary, etc.
            html += renderOptionsInput(question, savedResponse, scaleId, state.currentQuestionIndex);
    }
    
    elements.questionContainer.innerHTML = html;
    
    // Attach event handlers based on question type
    attachInputHandlers(question, scaleId, state.currentQuestionIndex);
    
    // Update progress
    updateProgressBars();
    updateNavigationButtons();
}

/**
 * Render time input
 */
function renderTimeInput(question, savedResponse, questionIndex) {
    // Parse saved response to extract hour, minute, period
    let savedHour = '', savedMinute = '', savedPeriod = 'PM';
    if (savedResponse) {
        const match = savedResponse.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (match) {
            savedHour = match[1];
            savedMinute = match[2];
            savedPeriod = match[3] ? match[3].toUpperCase() : 'PM';
        }
    }
    
    // Generate hour options (1-12)
    let hourOptions = '<option value="">--</option>';
    for (let h = 1; h <= 12; h++) {
        const selected = savedHour == h ? 'selected' : '';
        hourOptions += `<option value="${h}" ${selected}>${h}</option>`;
    }
    
    // Generate minute options (00, 15, 30, 45)
    let minuteOptions = '<option value="">--</option>';
    [0, 15, 30, 45].forEach(m => {
        const mStr = m.toString().padStart(2, '0');
        const selected = savedMinute == mStr ? 'selected' : '';
        minuteOptions += `<option value="${mStr}" ${selected}>${mStr}</option>`;
    });
    
    return `
        <div class="input-container time-dropdown-container">
            <div class="time-dropdowns">
                <select class="form-select time-hour" data-question="${questionIndex}" data-part="hour">
                    ${hourOptions}
                </select>
                <span class="time-separator">:</span>
                <select class="form-select time-minute" data-question="${questionIndex}" data-part="minute">
                    ${minuteOptions}
                </select>
                <select class="form-select time-period" data-question="${questionIndex}" data-part="period">
                    <option value="AM" ${savedPeriod === 'AM' ? 'selected' : ''}>AM</option>
                    <option value="PM" ${savedPeriod === 'PM' ? 'selected' : ''}>PM</option>
                </select>
            </div>
            <div class="input-hint">Select hour, minutes, and AM/PM</div>
        </div>
    `;
}

/**
 * Render number input - uses text input for exact values or dropdown for predefined ranges
 */
function renderNumberInput(question, savedResponse, questionIndex) {
    const min = question.minValue !== undefined ? question.minValue : (question.min !== undefined ? question.min : 0);
    const max = question.maxValue !== undefined ? question.maxValue : (question.max !== undefined ? question.max : 999);
    const step = question.step || 1;
    const unit = question.unit || '';
    
    // For "days" or "numeric" type questions, use a direct number input for exact values
    if (unit === 'days' || question.type === 'numeric' || question.useDirectInput === true) {
        return `
            <div class="input-container numeric-input-container">
                <div class="number-input-wrapper">
                    <input type="number" 
                           id="responseInput"
                           class="form-input question-input number-input" 
                           data-question="${questionIndex}"
                           min="${min}" 
                           max="${max}" 
                           step="${step}"
                           value="${savedResponse !== undefined ? savedResponse : ''}"
                           placeholder="Enter number"
                           inputmode="numeric">
                    ${unit ? `<span class="input-unit-label">${unit}</span>` : ''}
                </div>
                <div class="input-hint">Enter a number between ${min} and ${max}${unit ? ' ' + unit : ''}</div>
            </div>
        `;
    }
    
    // For other ranges, use dropdown
    let options = '<option value="">Select...</option>';
    
    if (max - min <= 60) {
        // Small range - show all values
        for (let v = min; v <= max; v += step) {
            const selected = savedResponse == v ? 'selected' : '';
            options += `<option value="${v}" ${selected}>${v}${unit ? ' ' + unit : ''}</option>`;
        }
    } else {
        // Large range - create intervals
        const intervals = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720];
        // Filter to valid range
        const validIntervals = intervals.filter(v => v >= min && v <= max);
        
        // Add custom groupings for minutes-style input
        validIntervals.forEach(v => {
            const selected = savedResponse == v ? 'selected' : '';
            let label = v.toString();
            if (unit === 'minutes' && v >= 60) {
                const hrs = Math.floor(v / 60);
                const mins = v % 60;
                label = `${v} (${hrs}h${mins > 0 ? ' ' + mins + 'm' : ''})`;
            }
            options += `<option value="${v}" ${selected}>${label}</option>`;
        });
    }
    
    return `
        <div class="input-container">
            <div class="number-dropdown-wrapper">
                <select class="form-select question-input number-select" 
                        data-question="${questionIndex}">
                    ${options}
                </select>
                ${unit ? `<span class="input-unit">${unit}</span>` : ''}
            </div>
            ${min !== undefined || max !== undefined ? 
                `<div class="input-hint">Range: ${min} - ${max}${unit ? ' ' + unit : ''}</div>` : ''}
        </div>
    `;
}

/**
 * Render text input
 */
function renderTextInput(question, savedResponse, questionIndex) {
    return `
        <div class="input-container">
            <textarea class="form-input question-input text-input" 
                      data-question="${questionIndex}"
                      placeholder="${question.placeholder || 'Enter your response...'}"
                      rows="3">${savedResponse || ''}</textarea>
        </div>
    `;
}

/**
 * Render Visual Analogue Scale
 */
function renderVASInput(question, savedResponse, questionIndex) {
    const min = question.minValue || question.min || (question.range ? question.range.min : 0) || 0;
    const max = question.maxValue || question.max || (question.range ? question.range.max : 100) || 100;
    const defaultValue = Math.round((min + max) / 2);
    const value = savedResponse !== undefined ? savedResponse : defaultValue;
    const leftLabel = question.minLabel || question.leftAnchor || min;
    const rightLabel = question.maxLabel || question.rightAnchor || max;
    
    return `
        <div class="vas-input-container">
            <div class="vas-labels">
                <span class="vas-min-label">${leftLabel}</span>
                <span class="vas-max-label">${rightLabel}</span>
            </div>
            <input type="range" 
                   class="vas-input" 
                   data-question="${questionIndex}"
                   min="${min}" 
                   max="${max}" 
                   value="${value}">
            <div class="vas-value-display">
                <span class="vas-value">${value}</span>
            </div>
        </div>
    `;
}

/**
 * Render likert with optional text field
 */
function renderLikertWithText(question, savedResponse, scaleId, questionIndex) {
    let html = renderOptionsInput(question, savedResponse?.value || savedResponse, scaleId, questionIndex);
    
    if (question.textField) {
        html += `
            <div class="additional-text-container">
                <label class="form-label">${question.textField.label || 'Please describe:'}</label>
                <textarea class="form-input text-input" 
                          id="additionalText"
                          placeholder="${question.textField.placeholder || 'Enter additional details...'}"
                          rows="2">${savedResponse?.text || ''}</textarea>
            </div>
        `;
    }
    
    return html;
}

/**
 * Render options (likert, single-choice, binary)
 */
function renderOptionsInput(question, savedResponse, scaleId, questionIndex) {
    if (!question.options) return '';
    
    let html = '<div class="response-options">';
    
    question.options.forEach((option, index) => {
        const value = option.value !== undefined ? option.value : index;
        const label = option.label || option;
        const isSelected = savedResponse !== undefined && savedResponse == value;
        const points = option.points !== undefined ? option.points : value;
        
        html += `
            <label class="response-option ${isSelected ? 'selected' : ''}" data-value="${value}">
                <input type="radio" name="response" value="${value}" ${isSelected ? 'checked' : ''}>
                <span class="radio-custom"></span>
                <span class="response-label">
                    <span class="response-text">${label}</span>
                    ${question.showScore !== false && currentScale.isClinician !== true ? 
                        `<span class="response-score">Score: ${points}</span>` : ''}
                </span>
            </label>
        `;
    });
    
    html += '</div>';
    return html;
}

/**
 * Attach event handlers for different input types
 */
function attachInputHandlers(question, scaleId, questionIndex) {
    const input = document.getElementById('responseInput');
    
    switch (question.type) {
        case 'time':
        case 'number':
        case 'numeric':
        case 'text':
            if (input) {
                input.addEventListener('input', (e) => {
                    StateManager.recordResponse(scaleId, questionIndex, e.target.value);
                    elements.validationMessage.classList.add('hidden');
                });
                input.addEventListener('change', (e) => {
                    StateManager.recordResponse(scaleId, questionIndex, e.target.value);
                });
            }
            break;
            
        case 'visual-analogue-scale':
        case 'vas':
            if (input) {
                const valueDisplay = document.getElementById('vasCurrentValue');
                input.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (valueDisplay) valueDisplay.textContent = value;
                    StateManager.recordResponse(scaleId, questionIndex, value);
                    elements.validationMessage.classList.add('hidden');
                });
            }
            break;
            
        case 'likert-with-text':
            // Handle both likert options and text field
            const options = elements.questionContainer.querySelectorAll('.response-option');
            const additionalText = document.getElementById('additionalText');
            
            options.forEach(option => {
                option.addEventListener('click', () => {
                    options.forEach(o => o.classList.remove('selected'));
                    option.classList.add('selected');
                    option.querySelector('input').checked = true;
                    
                    const value = option.dataset.value;
                    const text = additionalText ? additionalText.value : '';
                    StateManager.recordResponse(scaleId, questionIndex, { value, text });
                    elements.validationMessage.classList.add('hidden');
                });
            });
            
            if (additionalText) {
                additionalText.addEventListener('input', (e) => {
                    const selectedOption = elements.questionContainer.querySelector('.response-option.selected');
                    const value = selectedOption ? selectedOption.dataset.value : null;
                    StateManager.recordResponse(scaleId, questionIndex, { value, text: e.target.value });
                });
            }
            break;
            
        default:
            // Standard options click handlers
            const standardOptions = elements.questionContainer.querySelectorAll('.response-option');
            standardOptions.forEach(option => {
                option.addEventListener('click', () => {
                    standardOptions.forEach(o => o.classList.remove('selected'));
                    option.classList.add('selected');
                    option.querySelector('input').checked = true;
                    
                    const value = option.dataset.value;
                    StateManager.recordResponse(scaleId, questionIndex, value);
                    elements.validationMessage.classList.add('hidden');
                });
            });
    }
}

/**
 * Update progress bars
 */
function updateProgressBars() {
    const state = StateManager.getState();
    
    // Overall progress (across all scales)
    const totalScales = state.scaleOrder.length;
    const completedScales = state.currentScaleIndex;
    const scaleProgress = currentScale ? state.currentQuestionIndex / currentScale.questions.length : 0;
    const overallProgress = ((completedScales + scaleProgress) / totalScales) * 100;
    elements.overallProgress.style.width = `${overallProgress}%`;
    
    // Question progress (within current scale)
    if (currentScale) {
        const questionProgress = ((state.currentQuestionIndex + 1) / currentScale.questions.length) * 100;
        elements.questionProgress.style.width = `${questionProgress}%`;
        elements.questionCounter.textContent = `Question ${state.currentQuestionIndex + 1} of ${currentScale.questions.length}`;
    }
}

/**
 * Update navigation button states
 */
function updateNavigationButtons() {
    const state = StateManager.getState();
    
    // Previous button
    const isFirstQuestion = state.currentScaleIndex === 0 && state.currentQuestionIndex === 0;
    elements.btnPrevQuestion.disabled = isFirstQuestion;
    
    // Next button text
    const isLastQuestion = currentScale && state.currentQuestionIndex >= currentScale.questions.length - 1;
    const isLastScale = state.currentScaleIndex >= state.scaleOrder.length - 1;
    
    if (isLastQuestion && isLastScale) {
        elements.btnNextQuestion.innerHTML = 'Complete <i class="fas fa-check"></i>';
    } else if (isLastQuestion) {
        elements.btnNextQuestion.innerHTML = 'Next Scale <i class="fas fa-arrow-right"></i>';
    } else {
        elements.btnNextQuestion.innerHTML = 'Next Scale <i class="fas fa-arrow-right"></i>';
    }
}

/**
 * Handle previous scale button
 */
function handlePreviousQuestion() {
    const state = StateManager.getState();
    
    if (state.currentScaleIndex > 0) {
        // Go to previous scale
        StateManager.updateState({
            currentScaleIndex: state.currentScaleIndex - 1
        });
        loadCurrentScale();
        // Scroll to top
        elements.questionsContainer.scrollTop = 0;
    }
}

/**
 * Handle next scale button
 */
async function handleNextQuestion() {
    try {
        const state = StateManager.getState();
        const scaleId = state.scaleOrder[state.currentScaleIndex];
        console.log('handleNextQuestion - current scale:', scaleId, 'index:', state.currentScaleIndex);
        
    // Check if all questions are answered
    const responses = StateManager.getScaleResponses(scaleId) || {};
    const answeredCount = Object.keys(responses).length;
    const totalQuestions = currentScale.questions.length;
    
    // Find unanswered questions (only required ones)
    const unansweredRequired = currentScale.questions.filter((q, idx) => {
        const isRequired = q.required !== false;
        return isRequired && responses[idx] === undefined;
    });
    
    if (unansweredRequired.length > 0) {
        // Show validation and scroll to first unanswered
        elements.validationMessage.classList.remove('hidden');
        setTimeout(() => elements.validationMessage.classList.add('hidden'), 3000);
        
        // Scroll to first unanswered question
        const firstUnanswered = document.querySelector(`.question-card:not(.answered)`);
        if (firstUnanswered) {
            firstUnanswered.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstUnanswered.classList.add('highlight');
            setTimeout(() => firstUnanswered.classList.remove('highlight'), 2000);
        }
        return;
    }
    
    elements.validationMessage.classList.add('hidden');
    
    // Calculate score for current scale
    console.log('Calculating score for', scaleId);
    ScaleEngine.calculateScore(scaleId, responses, currentScale);
    console.log('Score calculated successfully');
    
    const isLastScale = state.currentScaleIndex >= state.scaleOrder.length - 1;
    
    if (isLastScale) {
        // Assessment complete - show confirmation modal
        showCompletionModal();
    } else {
        // Move to next scale
        console.log('Moving to next scale...');
        StateManager.moveToNextScale();
        await loadCurrentScale();
        console.log('Next scale loaded successfully');
        // Scroll to top
        elements.questionsContainer.scrollTop = 0;
    }
    } catch (error) {
        console.error('Error in handleNextQuestion:', error);
        showError('Error moving to next scale: ' + error.message);
    }
}

/**
 * Handle keyboard navigation
 */
function handleKeyboardNavigation(e) {
    // Only handle in assessment screen
    if (!elements.screenAssessment.classList.contains('active')) return;
    
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNextQuestion();
    } else if (e.key === 'ArrowLeft') {
        handlePreviousQuestion();
    } else if (e.key >= '1' && e.key <= '9') {
        // Number key to select option
        const options = elements.questionContainer.querySelectorAll('.response-option');
        const index = parseInt(e.key) - 1;
        if (options[index]) {
            options[index].click();
        }
    }
}

/**
 * Show results screen
 */
function showResults() {
    const state = StateManager.getState();
    const scores = StateManager.getAllScores();
    const riskFlags = StateManager.getRiskFlags();
    const conditions = StateManager.getConditions();
    
    // Patient info
    elements.resultPatientId.textContent = state.patient_id;
    elements.resultDate.textContent = new Date(state.session_start).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Show all conditions (joined by +)
    const conditionLabels = conditions.map(c => c.label).join(' + ');
    elements.resultCondition.textContent = conditionLabels || state.conditionLabel;
    
    // Risk flags - hidden per user request
    elements.riskFlagsCard.classList.add('hidden');
    
    // Scale results - render with enhanced display
    elements.scaleResults.innerHTML = Object.values(scores).map(score => {
        return renderScaleResultCard(score);
    }).join('');
    
    // Composite summary for all conditions
    let summary = '';
    conditions.forEach(cond => {
        const condConfig = conditionMap.conditions[cond.id];
        if (condConfig) {
            const condSummary = ScaleEngine.generateCompositeSummary(scores, condConfig);
            if (summary) summary += '<br><br>';
            summary += `<strong>${cond.label}:</strong> ${condSummary}`;
        }
    });
    if (!summary) {
        // Fallback for single condition
        summary = ScaleEngine.generateCompositeSummary(scores, conditionMap.conditions[state.condition]);
    }
    elements.compositeSummary.innerHTML = `<p>${summary}</p>`;
    
    showScreen('results');
}

/**
 * Render a scale result card with appropriate visualization
 */
function renderScaleResultCard(score) {
    const scaleConfig = scales[score.scaleId] || null;
    const severityClass = `severity-${score.severity?.level || 'unknown'}`;
    const percentage = score.percentage || 0;
    
    // Build the score visualization
    let scoreVisualization = '';
    
    // Special handling for profile-based scales (EQ-5D-5L)
    if (score.isProfileBased) {
        scoreVisualization = renderProfileBasedScore(score);
    } else {
        scoreVisualization = `
            <div class="score-visual">
                <div class="score-circle ${severityClass}">
                    <span class="score-number">${formatScoreValue(score.total)}</span>
                    <span class="score-max-label">/ ${score.maxPossible}</span>
                </div>
                <span class="score-percentage">${percentage}%</span>
            </div>
        `;
    }
    
    // Severity badge
    const severityBadge = score.severity ? `
        <div class="severity-label ${severityClass}">
            <i class="fas fa-circle"></i>
            ${score.severity.label}
        </div>
    ` : '';
    
    // Severity description
    const severityDescription = score.severity?.description ? `
        <p class="severity-description">${score.severity.description}</p>
    ` : '';
    
    // Cutoff indicator for binary screening scales
    let cutoffIndicator = '';
    if (score.cutoff !== undefined && score.isPositive !== null) {
        cutoffIndicator = `
            <div class="cutoff-indicator ${score.isPositive ? 'cutoff-positive' : 'cutoff-negative'}">
                <i class="fas ${score.isPositive ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>
                ${score.isPositive 
                    ? `Score ≥ ${score.cutoff}: Positive screening result` 
                    : `Score < ${score.cutoff}: Negative screening result`}
            </div>
        `;
    }
    
    // Component scores (PSQI)
    let componentScores = '';
    if (score.componentScores && Object.keys(score.componentScores).length > 0) {
        componentScores = `
            <div class="component-scores">
                <div class="component-title">Component Scores</div>
                <div class="component-grid">
                    ${Object.values(score.componentScores).map(comp => `
                        <div class="component-item">
                            <span class="component-name">${comp.name}</span>
                            <span class="component-value">${comp.score}/${comp.maxScore}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Domain scores (COMPASS-31)
    let domainScores = '';
    if (score.domainScores && Object.keys(score.domainScores).length > 0) {
        domainScores = `
            <div class="domain-scores">
                <div class="component-title">Domain Scores</div>
                ${Object.values(score.domainScores).map(domain => {
                    const pct = domain.maxWeighted > 0 ? (domain.weighted / domain.maxWeighted) * 100 : 0;
                    return `
                        <div class="domain-item">
                            <div class="domain-header">
                                <span class="domain-name">${domain.name}</span>
                                <span class="domain-value">${domain.weighted.toFixed(1)}</span>
                            </div>
                            <div class="domain-bar">
                                <div class="domain-bar-fill" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    // Subscale scores (DASS-21, BDI-II)
    let subscaleScores = '';
    if (score.subscaleScores && Object.keys(score.subscaleScores).length > 0) {
        const hasSubscaleSeverity = score.hasSubscaleSeverity;
        
        if (hasSubscaleSeverity) {
            subscaleScores = `
                <div class="subscale-scores">
                    <div class="subscale-title">Subscale Results</div>
                    ${Object.values(score.subscaleScores).map(sub => {
                        const subSeverityClass = sub.severity?.level ? `severity-${sub.severity.level}` : '';
                        return `
                            <div class="subscale-with-severity">
                                <div class="subscale-info">
                                    <div class="subscale-label">${sub.name}</div>
                                    <div class="subscale-score">Score: ${sub.score}</div>
                                </div>
                                ${sub.severity ? `
                                    <span class="subscale-severity-badge ${subSeverityClass}">
                                        ${sub.severity.label}
                                    </span>
                                ` : `
                                    <span class="subscale-value">${sub.score}</span>
                                `}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            subscaleScores = `
                <div class="subscale-scores">
                    <div class="subscale-title">Subscales</div>
                    ${Object.values(score.subscaleScores).map(sub => `
                        <div class="subscale-item">
                            <span class="subscale-name">${sub.name}</span>
                            <span class="subscale-value">${sub.score || sub.weighted || sub.raw}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
    
    return `
        <div class="scale-result-card">
            <div class="scale-result-header">
                <span class="scale-result-name">${score.scaleName}</span>
                ${scaleConfig?.isClinician ? '<span class="scale-result-badge">Clinician-Rated</span>' : ''}
            </div>
            <div class="scale-result-body">
                ${scoreVisualization}
                ${severityBadge}
                ${severityDescription}
                ${cutoffIndicator}
                ${componentScores}
                ${domainScores}
                ${subscaleScores}
            </div>
        </div>
    `;
}

/**
 * Render profile-based score (EQ-5D-5L style)
 */
function renderProfileBasedScore(score) {
    let dimensionDisplay = '';
    
    if (score.dimensionScores) {
        dimensionDisplay = `
            <div class="dimension-scores">
                <div class="dimension-grid">
                    ${Object.values(score.dimensionScores).map(dim => {
                        const level = dim.level || 0;
                        let levelDots = '';
                        for (let i = 1; i <= 5; i++) {
                            const isActive = i <= level;
                            levelDots += `<span class="level-dot level-${i} ${isActive ? 'active' : ''}"></span>`;
                        }
                        return `
                            <div class="dimension-item">
                                <span class="dimension-label">${dim.label}</span>
                                <div class="dimension-level">
                                    ${levelDots}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Health state profile code
    const profileCode = score.healthStateProfile ? `
        <div class="health-state">
            <div class="health-state-label">Health State Profile</div>
            <div class="health-state-code">${score.healthStateProfile}</div>
        </div>
    ` : '';
    
    // VAS score
    const vasDisplay = score.vasScore !== null ? `
        <div class="vas-display">
            <div class="vas-label">Self-Rated Health (VAS)</div>
            <span class="vas-value">${score.vasScore}</span>
            <span class="vas-max">/100</span>
        </div>
    ` : '';
    
    return `
        ${dimensionDisplay}
        ${profileCode}
        ${vasDisplay}
    `;
}

/**
 * Format score value for display
 */
function formatScoreValue(value) {
    if (value === null || value === undefined) return '-';
    if (Number.isInteger(value)) return value;
    return value.toFixed(1);
}

/**
 * Handle PDF download
 */
async function handleDownloadPDF() {
    try {
        elements.btnDownloadPDF.disabled = true;
        elements.btnDownloadPDF.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        
        await PDFGenerator.downloadReport();
        
    } catch (error) {
        console.error('PDF generation failed:', error);
        showError('Failed to generate PDF. Please try again.');
    } finally {
        elements.btnDownloadPDF.disabled = false;
        elements.btnDownloadPDF.innerHTML = '<i class="fas fa-file-pdf"></i> Download PDF Report';
    }
}

/**
 * Handle CSV download - generates two files: summary + responses
 */
function handleDownloadCSV() {
    try {
        elements.btnDownloadCSV.disabled = true;
        elements.btnDownloadCSV.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        
        const state = StateManager.getState();
        const scores = StateManager.getAllScores();
        const responses = state.responses;
        const date = new Date(state.session_start).toISOString().split('T')[0];
        const baseFilename = `${state.patient_id}_${(state.condition || 'assessment').replace(/\s+/g, '-')}_${date}`;
        
        // ========================================
        // FILE 1: SUMMARY CSV (one row per scale)
        // ========================================
        const summaryRows = [];
        
        // Summary header
        summaryRows.push([
            'patient_id',
            'patient_name', 
            'condition',
            'assessment_date',
            'assessment_type',
            'scale_id',
            'scale_name',
            'total_score',
            'max_possible',
            'percentage',
            'severity_level',
            'severity_label',
            'subscale_1_name',
            'subscale_1_score',
            'subscale_2_name',
            'subscale_2_score',
            'subscale_3_name',
            'subscale_3_score'
        ].join(','));
        
        // Summary data rows
        Object.keys(scores).forEach(scaleId => {
            const score = scores[scaleId];
            
            // Get subscales if any
            const subscales = score.subscaleScores ? Object.values(score.subscaleScores) : [];
            
            // Get all condition labels (multi-condition support)
            const conditions = StateManager.getConditions();
            const conditionLabels = conditions.length > 0 
                ? conditions.map(c => c.label).join(' + ')
                : (state.conditionLabel || state.condition || '');
            
            const row = [
                escapeCSV(state.patient_id || ''),
                escapeCSV(state.patient_name || ''),
                escapeCSV(conditionLabels),
                escapeCSV(date),
                'Pre',
                escapeCSV(scaleId),
                escapeCSV(score.scaleName || scaleId),
                score.total ?? '',
                score.maxPossible ?? '',
                score.percentage ?? '',
                escapeCSV(score.severity?.level || ''),
                escapeCSV(score.severity?.label || ''),
                escapeCSV(subscales[0]?.name || ''),
                subscales[0]?.score ?? '',
                escapeCSV(subscales[1]?.name || ''),
                subscales[1]?.score ?? '',
                escapeCSV(subscales[2]?.name || ''),
                subscales[2]?.score ?? ''
            ];
            summaryRows.push(row.join(','));
        });
        
        downloadCSVFile(summaryRows.join('\n'), `${baseFilename}_SUMMARY.csv`);
        
        // ========================================
        // FILE 2: RESPONSES CSV (one row per question)
        // ========================================
        const responseRows = [];
        
        // Response header
        responseRows.push([
            'patient_id',
            'assessment_date',
            'scale_id',
            'scale_name',
            'question_number',
            'question_index',
            'response_value'
        ].join(','));
        
        // Response data rows
        Object.keys(responses).forEach(scaleId => {
            const scaleResponses = responses[scaleId];
            const score = scores[scaleId] || {};
            
            // Sort question numbers
            const questionNums = Object.keys(scaleResponses).sort((a, b) => parseInt(a) - parseInt(b));
            
            questionNums.forEach((qIndex, displayNum) => {
                const row = [
                    escapeCSV(state.patient_id || ''),
                    escapeCSV(date),
                    escapeCSV(scaleId),
                    escapeCSV(score.scaleName || scaleId),
                    displayNum + 1,  // Human-readable question number (1-based)
                    qIndex,          // Internal question index (0-based)
                    scaleResponses[qIndex]
                ];
                responseRows.push(row.join(','));
            });
        });
        
        // Small delay before second download
        setTimeout(() => {
            downloadCSVFile(responseRows.join('\n'), `${baseFilename}_RESPONSES.csv`);
        }, 500);
        
    } catch (error) {
        console.error('CSV generation failed:', error);
        showError('Failed to generate CSV. Please try again.');
    } finally {
        elements.btnDownloadCSV.disabled = false;
        elements.btnDownloadCSV.innerHTML = '<i class="fas fa-file-csv"></i> Download Data (CSV)';
    }
}

/**
 * Helper to download a CSV file
 */
function downloadCSVFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Toggle header dropdown menu
 */
function toggleHeaderMenu() {
    if (elements.headerDropdown) {
        elements.headerDropdown.classList.toggle('hidden');
    }
}

/**
 * Hide header dropdown menu
 */
function hideHeaderMenu() {
    if (elements.headerDropdown) {
        elements.headerDropdown.classList.add('hidden');
    }
}

/**
 * Toggle mobile sidebar visibility
 */
function toggleMobileSidebar() {
    if (elements.scaleSidebar) {
        elements.scaleSidebar.classList.toggle('open');
    }
    if (elements.sidebarOverlay) {
        elements.sidebarOverlay.classList.toggle('active');
    }
}

/**
 * Close mobile sidebar
 */
function closeMobileSidebar() {
    if (elements.scaleSidebar) {
        elements.scaleSidebar.classList.remove('open');
    }
    if (elements.sidebarOverlay) {
        elements.sidebarOverlay.classList.remove('active');
    }
}

/**
 * Handle skip scale - mark current scale as skipped and move to next
 */
function handleSkipScale() {
    const state = StateManager.getState();
    const scaleId = state.scaleOrder[state.currentScaleIndex];
    
    const confirmed = confirm(
        `Skip "${currentScale?.name || scaleId}"?\n\n` +
        'This scale will be marked as skipped and will not appear in reports.\n\n' +
        'You can go back and fill it in later to include it.'
    );
    
    if (!confirmed) return;
    
    // Mark scale as skipped
    StateManager.skipScale(scaleId);
    
    // Move to next scale or show completion modal
    if (StateManager.isLastScale()) {
        // Show completion modal
        showCompletionModal();
    } else {
        StateManager.moveToNextScale();
        loadCurrentScale();
    }
}

/**
 * Handle edit responses - go back to assessment from results
 */
function handleEditResponses() {
    const state = StateManager.getState();
    
    // Go back to the first scale (or could let user choose)
    StateManager.updateState({ currentScaleIndex: 0 });
    
    // Load and show assessment
    loadCurrentScale();
    showScreen('assessment');
}

/**
 * Handle new assessment - with confirmation
 */
function handleNewAssessment() {
    // Check if there's existing data
    const state = StateManager.getState();
    const hasData = state.patient_name || Object.keys(state.responses || {}).length > 0;
    
    if (hasData) {
        const confirmed = confirm(
            '⚠️ Start New Assessment?\n\n' +
            'This will clear all current data including:\n' +
            '• Patient information\n' +
            '• All questionnaire responses\n' +
            '• Calculated scores\n\n' +
            'Make sure you have downloaded the PDF/CSV reports if needed.\n\n' +
            'Click OK to start fresh, or Cancel to go back.'
        );
        
        if (!confirmed) {
            return;
        }
    }
    
    // Clear everything
    StateManager.initSession();
    StateManager.clearSavedState();
    currentScale = null;
    currentPatientId = null;
    selectedConditionId = null;
    
    // Reset patient entry form
    elements.patientName.value = '';
    elements.patientIdPreview.classList.add('hidden');
    elements.btnProceedToCondition.disabled = true;
    
    // Reset condition selection
    document.querySelectorAll('.condition-card').forEach(card => {
        card.classList.remove('selected');
    });
    elements.selectedConditionPanel.classList.add('hidden');
    
    showScreen('patient');
}

/**
 * Handle adding another condition to existing session
 */
function handleAddCondition() {
    console.log('Adding another condition to existing session');
    
    // Set flag to indicate we're in add mode
    isAddConditionMode = true;
    
    // Reset selection state but keep data
    selectedConditionId = null;
    
    // Update condition screen for add mode
    populateConditionGrid();
    updateConditionScreenForAddMode();
    
    // Show condition screen
    showScreen('condition');
}

/**
 * Update condition screen UI when in add mode
 */
function updateConditionScreenForAddMode() {
    const state = StateManager.getState();
    const existingConditions = StateManager.getConditions();
    
    // Update header text
    const conditionHeader = document.querySelector('#screenCondition h1');
    if (conditionHeader) {
        if (isAddConditionMode) {
            conditionHeader.textContent = 'Add Another Condition';
        } else {
            conditionHeader.textContent = 'Select Condition';
        }
    }
    
    // Disable already-selected condition cards and mark them
    document.querySelectorAll('.condition-card').forEach(card => {
        const conditionId = card.dataset.conditionId;
        const isAlreadySelected = existingConditions.some(c => c.id === conditionId);
        
        if (isAlreadySelected) {
            card.classList.add('already-selected');
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
        } else {
            card.classList.remove('already-selected');
            card.style.opacity = '';
            card.style.pointerEvents = '';
        }
    });
    
    // Hide selection panel initially
    elements.selectedConditionPanel.classList.add('hidden');
}

/**
 * DEV/DEBUG: Pre-fill all questions in current scale with default answers
 */
function devPrefillCurrentScale() {
    if (!currentScale || !currentScale.questions) {
        console.log('No scale loaded');
        return;
    }
    
    const state = StateManager.getState();
    const scaleId = state.scaleOrder[state.currentScaleIndex];
    
    currentScale.questions.forEach((question, index) => {
        let defaultValue;
        
        switch (question.type) {
            case 'time':
                defaultValue = '10:00 PM';
                break;
            case 'number':
                defaultValue = question.min !== undefined ? question.min : 1;
                break;
            case 'text':
                defaultValue = 'Test response';
                break;
            case 'visual-analogue-scale':
            case 'vas':
                defaultValue = question.range ? Math.round((question.range.min + question.range.max) / 2) : 5;
                break;
            default:
                // For likert/options, pick the middle option or first option
                if (question.options && question.options.length > 0) {
                    const midIndex = Math.floor(question.options.length / 2);
                    defaultValue = question.options[midIndex].value !== undefined 
                        ? question.options[midIndex].value 
                        : midIndex;
                } else {
                    defaultValue = 1;
                }
        }
        
        StateManager.recordResponse(scaleId, index, defaultValue);
    });
    
    // Re-render to show filled answers
    renderAllQuestions();
    console.log(`Pre-filled ${currentScale.questions.length} questions for ${scaleId}`);
}

// Expose to window for console access
window.devPrefillCurrentScale = devPrefillCurrentScale;

/**
 * Handle settings change
 */
function handleSettingsChange() {
    StateManager.updateSettings({
        autoSave: elements.settingAutoSave.checked,
        showQuestionNumbers: elements.settingShowNumbers.checked
    });
}

// ========================================
// UI HELPERS
// ========================================

/**
 * Show a specific screen
 */
function showScreen(screenName) {
    // Hide all screens
    elements.screenPatient.classList.remove('active');
    elements.screenCondition.classList.remove('active');
    elements.screenAssessment.classList.remove('active');
    elements.screenResults.classList.remove('active');
    
    // Show requested screen
    switch (screenName) {
        case 'patient':
            elements.screenPatient.classList.add('active');
            break;
        case 'condition':
            elements.screenCondition.classList.add('active');
            break;
        case 'assessment':
            elements.screenAssessment.classList.add('active');
            break;
        case 'results':
            elements.screenResults.classList.add('active');
            break;
    }
}

/**
 * Show modal
 */
function showModal(modalName) {
    if (modalName === 'settings') {
        // Sync settings with state
        const state = StateManager.getState();
        elements.settingAutoSave.checked = state.settings.autoSave;
        elements.settingShowNumbers.checked = state.settings.showQuestionNumbers;
        elements.modalSettings.classList.remove('hidden');
    } else if (modalName === 'completion') {
        elements.modalCompletion.classList.remove('hidden');
    }
}

/**
 * Hide modal
 */
function hideModal(modalName) {
    if (modalName === 'settings') {
        elements.modalSettings.classList.add('hidden');
    } else if (modalName === 'completion') {
        elements.modalCompletion.classList.add('hidden');
    }
}

/**
 * Show completion confirmation modal
 */
function showCompletionModal() {
    const state = StateManager.getState();
    const skippedScales = StateManager.getSkippedScales();
    
    // Build summary
    let completedCount = 0;
    let skippedCount = 0;
    
    state.scaleOrder.forEach(scaleId => {
        const responses = StateManager.getScaleResponses(scaleId);
        const hasResponses = Object.keys(responses || {}).length > 0;
        const isSkipped = skippedScales.includes(scaleId) && !hasResponses;
        
        if (isSkipped) {
            skippedCount++;
        } else if (hasResponses) {
            completedCount++;
        }
    });
    
    elements.completionSummary.innerHTML = `
        <div class="completion-summary-item">
            <span>Total Scales:</span>
            <strong>${state.scaleOrder.length}</strong>
        </div>
        <div class="completion-summary-item">
            <span>Completed:</span>
            <strong style="color: var(--success);">${completedCount}</strong>
        </div>
        <div class="completion-summary-item">
            <span>Skipped:</span>
            <strong style="color: #ff9800;">${skippedCount}</strong>
        </div>
    `;
    
    showModal('completion');
}

/**
 * Handle completion confirmation
 */
function handleConfirmCompletion() {
    hideModal('completion');
    
    // Show loading overlay
    elements.loadingOverlay.classList.remove('hidden');
    
    // Simulate calculation time (1 second)
    setTimeout(() => {
        elements.loadingOverlay.classList.add('hidden');
        showResults();
    }, 1000);
}

/**
 * Show error message
 */
function showError(message) {
    // For now, use alert - could be replaced with custom modal
    alert(message);
}

// ========================================
// START APPLICATION
// ========================================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.PRS = {
    StateManager,
    ScaleEngine,
    PDFGenerator,
    getState: () => StateManager.getState(),
    getScales: () => scales
};
