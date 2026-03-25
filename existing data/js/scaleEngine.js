/**
 * =============================================
 * SCALE ENGINE
 * Handles score calculation, severity classification,
 * and risk flag detection for all scales
 * =============================================
 */

import * as StateManager from './stateManager.js';

/**
 * Scoring type handlers
 * Each function takes responses and scale config, returns score data
 */
const scoringHandlers = {
    
    /**
     * Simple sum of all response values
     * Supports both likert options and direct numeric input
     */
    sum: (responses, scaleConfig) => {
        let total = 0;
        const questionScores = {};
        const scoredQuestions = scaleConfig.scoredQuestions || null;
        
        scaleConfig.questions.forEach((question, index) => {
            // Skip if not in scoredQuestions (when defined)
            if (scoredQuestions && !scoredQuestions.includes(index)) return;
            // Skip if scoredInTotal is false OR includeInScore is false
            if (question.scoredInTotal === false) return;
            if (question.includeInScore === false) return;
            if (question.supplementary === true) return;
            
            const value = responses[index];
            if (value !== undefined) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    // Check for points override in options
                    const option = question.options?.find(o => o.value == value);
                    const points = option?.points !== undefined ? option.points : numValue;
                    total += points;
                    questionScores[index] = points;
                }
            }
        });
        
        return {
            total,
            maxPossible: scaleConfig.maxScore || calculateMaxScore(scaleConfig),
            questionScores
        };
    },
    
    /**
     * Sum-numeric: alias for sum, handles direct numeric inputs
     * Used by MIDAS and similar scales with day-count entries
     */
    'sum-numeric': (responses, scaleConfig) => {
        // Use the same logic as sum - it handles numeric values properly
        return scoringHandlers.sum(responses, scaleConfig);
    },
    
    /**
     * FIQR weighted scoring
     * Function domain (Q1-9): sum ÷ 3 = 0-30
     * Overall domain (Q10-11): sum = 0-20
     * Symptoms domain (Q12-21): sum ÷ 2 = 0-50
     * Total: 0-100
     */
    'fiqr-weighted': (responses, scaleConfig) => {
        const domains = scaleConfig.domains || {};
        const domainScores = {};
        let total = 0;
        
        // Calculate each domain score
        Object.keys(domains).forEach(domainId => {
            const domain = domains[domainId];
            let domainRaw = 0;
            let answeredCount = 0;
            
            domain.items.forEach(itemIndex => {
                const value = responses[itemIndex];
                if (value !== undefined && value !== null && value !== '') {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        domainRaw += numValue;
                        answeredCount++;
                    }
                }
            });
            
            // Apply divisor
            const divisor = domain.divisor || 1;
            const domainScore = domainRaw / divisor;
            
            domainScores[domainId] = {
                name: domain.name,
                raw: domainRaw,
                divisor: divisor,
                score: Math.round(domainScore * 100) / 100,
                maxWeighted: domain.maxWeighted,
                itemsAnswered: answeredCount,
                totalItems: domain.items.length
            };
            
            total += domainScore;
        });
        
        return {
            total: Math.round(total * 100) / 100,
            maxPossible: scaleConfig.maxScore || 100,
            domainScores
        };
    },
    
    /**
     * Sum with subscale multiplication (e.g., DASS-21)
     */
    'subscale-sum': (responses, scaleConfig) => {
        const subscaleScores = {};
        let total = 0;
        
        if (scaleConfig.subscales) {
            scaleConfig.subscales.forEach(subscale => {
                let subscaleTotal = 0;
                subscale.questionIndices.forEach(idx => {
                    const value = responses[idx];
                    if (value !== undefined) {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue)) {
                            const question = scaleConfig.questions[idx];
                            const option = question?.options?.find(o => o.value == value);
                            const points = option?.points !== undefined ? option.points : numValue;
                            subscaleTotal += points;
                        }
                    }
                });
                
                const multiplier = subscale.multiplier || 1;
                const subscaleScore = subscaleTotal * multiplier;
                subscaleScores[subscale.id] = {
                    name: subscale.name,
                    raw: subscaleTotal,
                    multiplier: multiplier,
                    score: subscaleScore
                };
                total += subscaleScore;
            });
        }
        
        return {
            total: Math.round(total * 100) / 100,
            maxPossible: scaleConfig.maxScore,
            subscaleScores
        };
    },
    
    /**
     * Weighted binary scoring (e.g., LANSS, DN4)
     */
    'weighted-binary': (responses, scaleConfig) => {
        let total = 0;
        const questionScores = {};
        
        scaleConfig.questions.forEach((question, index) => {
            const value = responses[index];
            if (value !== undefined) {
                const option = question.options?.find(o => o.value == value);
                const points = option?.points !== undefined ? option.points : 0;
                total += points;
                questionScores[index] = points;
            }
        });
        
        // Check against cutoff if defined
        const cutoff = scaleConfig.cutoff;
        const isPositive = cutoff !== undefined ? total >= cutoff : null;
        
        return {
            total,
            maxPossible: scaleConfig.maxScore || calculateMaxScore(scaleConfig),
            questionScores,
            cutoff,
            isPositive
        };
    },
    
    /**
     * Weighted domain scoring (e.g., COMPASS-31)
     */
    'weighted-domain-sum': (responses, scaleConfig) => {
        const domainScores = {};
        let total = 0;
        
        if (scaleConfig.domains) {
            scaleConfig.domains.forEach(domain => {
                let domainRaw = 0;
                let maxDomainRaw = 0;
                
                domain.questionIndices.forEach(idx => {
                    const question = scaleConfig.questions[idx];
                    if (!question) return;
                    
                    // Skip if conditional and not met
                    if (question.conditionalOn) {
                        const conditionMet = checkConditional(question.conditionalOn, responses);
                        if (!conditionMet) return;
                    }
                    
                    const value = responses[idx];
                    if (value !== undefined) {
                        const option = question.options?.find(o => o.value == value);
                        const points = option?.points !== undefined ? option.points : parseFloat(value) || 0;
                        domainRaw += points;
                    }
                    
                    // Calculate max for this question
                    if (question.options) {
                        const maxPoints = Math.max(...question.options.map(o => o.points !== undefined ? o.points : o.value));
                        maxDomainRaw += maxPoints;
                    }
                });
                
                const multiplier = domain.multiplier || 1;
                const weightedScore = domainRaw * multiplier;
                const maxWeighted = domain.maxScore || maxDomainRaw * multiplier;
                
                domainScores[domain.id] = {
                    name: domain.name,
                    raw: domainRaw,
                    multiplier: multiplier,
                    weighted: Math.round(weightedScore * 100) / 100,
                    maxRaw: maxDomainRaw,
                    maxWeighted: Math.round(maxWeighted * 100) / 100
                };
                
                total += weightedScore;
            });
        }
        
        return {
            total: Math.round(total * 100) / 100,
            maxPossible: scaleConfig.maxScore || 100,
            domainScores
        };
    },
    
    /**
     * Component-based scoring (e.g., PSQI)
     */
    'component-sum': (responses, scaleConfig) => {
        const componentScores = {};
        let globalScore = 0;
        
        if (scaleConfig.components) {
            scaleConfig.components.forEach(component => {
                const componentScore = calculateComponentScore(component, responses, scaleConfig);
                componentScores[component.id] = {
                    name: component.name,
                    description: component.description,
                    score: componentScore,
                    maxScore: component.maxScore || 3
                };
                globalScore += componentScore;
            });
        }
        
        return {
            total: globalScore,
            maxPossible: scaleConfig.maxScore || 21,
            componentScores,
            componentCount: scaleConfig.componentCount || Object.keys(componentScores).length
        };
    },
    
    /**
     * Profile and VAS scoring (e.g., EQ-5D-5L)
     */
    'profile-and-vas': (responses, scaleConfig) => {
        const dimensionScores = {};
        let healthStateProfile = '';
        let vasScore = null;
        
        scaleConfig.questions.forEach((question, index) => {
            const value = responses[index];
            
            if (question.type === 'visual-analogue-scale') {
                vasScore = value !== undefined ? parseFloat(value) : null;
            } else if (question.dimension) {
                const numValue = value !== undefined ? parseInt(value) : null;
                dimensionScores[question.dimension] = {
                    label: question.question || question.text || question.label,
                    level: numValue,
                    maxLevel: 5
                };
                healthStateProfile += numValue !== null ? numValue : 'X';
            }
        });
        
        return {
            total: vasScore,
            maxPossible: 100,
            healthStateProfile,
            dimensionScores,
            vasScore,
            isProfileBased: true
        };
    },
    
    /**
     * Reverse scored items (e.g., RAADS-14)
     */
    'reverse-scored': (responses, scaleConfig) => {
        let total = 0;
        const questionScores = {};
        const reverseItems = scaleConfig.reverseItems || [];
        const maxItemScore = scaleConfig.maxItemScore || 3;
        
        scaleConfig.questions.forEach((question, index) => {
            const value = responses[index];
            if (value !== undefined) {
                let numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    // Reverse score if this is a reverse item
                    if (reverseItems.includes(index)) {
                        numValue = maxItemScore - numValue;
                    }
                    total += numValue;
                    questionScores[index] = numValue;
                }
            }
        });
        
        return {
            total,
            maxPossible: scaleConfig.maxScore || calculateMaxScore(scaleConfig),
            questionScores,
            reverseItems
        };
    },
    
    /**
     * Subscale with subscale-level severity (e.g., DASS-21)
     */
    'subscale-severity': (responses, scaleConfig) => {
        const subscaleScores = {};
        let overallTotal = 0;
        
        if (scaleConfig.subscales) {
            scaleConfig.subscales.forEach(subscale => {
                let subscaleRaw = 0;
                subscale.questionIndices.forEach(idx => {
                    const value = responses[idx];
                    if (value !== undefined) {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue)) {
                            subscaleRaw += numValue;
                        }
                    }
                });
                
                const multiplier = subscale.multiplier || 1;
                const finalScore = subscaleRaw * multiplier;
                
                // Get subscale severity if defined
                let severity = null;
                if (subscale.severityBands) {
                    severity = getSeverityClassification(finalScore, subscale.severityBands);
                }
                
                subscaleScores[subscale.id] = {
                    name: subscale.name,
                    raw: subscaleRaw,
                    multiplier: multiplier,
                    score: finalScore,
                    severity: severity
                };
                
                overallTotal += finalScore;
            });
        }
        
        return {
            total: overallTotal,
            maxPossible: scaleConfig.maxScore,
            subscaleScores,
            hasSubscaleSeverity: true
        };
    },
    
    /**
     * Clinician range scale (like EDSS, MADRS)
     */
    'clinician': (responses, scaleConfig) => {
        let total = 0;
        const questionScores = {};
        
        scaleConfig.questions.forEach((question, index) => {
            const value = responses[index];
            if (value !== undefined) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    total += numValue;
                    questionScores[index] = numValue;
                }
            }
        });
        
        return {
            total,
            maxPossible: scaleConfig.maxScore || 60,
            questionScores,
            isClinician: true
        };
    },
    
    /**
     * Average score calculation
     */
    average: (responses, scaleConfig) => {
        const values = Object.values(responses).map(v => parseFloat(v)).filter(v => !isNaN(v));
        const total = values.reduce((sum, v) => sum + v, 0);
        const average = values.length > 0 ? total / values.length : 0;
        
        return {
            total: Math.round(average * 100) / 100,
            sum: total,
            count: values.length,
            maxPossible: scaleConfig.maxScore || 10
        };
    },
    
    /**
     * FIQR weighted scoring: (Function Sum / 3) + (Overall Sum) + (Symptoms Sum / 2)
     * Results in a 0-100 score.
     */
    'fiqr-weighted': (responses, scaleConfig) => {
        const domainScores = {};
        let total = 0;
        
        // Define FIQR domains if not provided in config
        const domains = scaleConfig.domains || {
            function: { items: [0,1,2,3,4,5,6,7,8], divisor: 3, maxWeighted: 30 },
            overall: { items: [9,10], divisor: 1, maxWeighted: 20 },
            symptoms: { items: [11,12,13,14,15,16,17,18,19,20], divisor: 2, maxWeighted: 50 }
        };
        
        Object.entries(domains).forEach(([domainId, domainConfig]) => {
            let domainRaw = 0;
            const items = domainConfig.items || [];
            
            items.forEach(idx => {
                const value = responses[idx];
                if (value !== undefined) {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        domainRaw += numValue;
                    }
                }
            });
            
            const divisor = domainConfig.divisor || 1;
            const weightedScore = domainRaw / divisor;
            const maxRaw = items.length * 10;
            const maxWeighted = domainConfig.maxWeighted || (maxRaw / divisor);
            
            domainScores[domainId] = {
                name: domainConfig.name || domainId,
                raw: domainRaw,
                maxRaw: maxRaw,
                divisor: divisor,
                weighted: Math.round(weightedScore * 100) / 100,
                maxWeighted: maxWeighted
            };
            
            total += weightedScore;
        });
        
        return {
            total: Math.round(total * 100) / 100,
            maxPossible: scaleConfig.maxScore || 100,
            domainScores,
            scoringFormula: "(Function/3) + (Overall) + (Symptoms/2)"
        };
    }
};

/**
 * Calculate component score for PSQI-style scales
 */
function calculateComponentScore(component, responses, scaleConfig) {
    const rules = component.scoringRules;
    
    // Direct score from single question
    if (component.questionIndices.length === 1 && !rules) {
        const idx = component.questionIndices[0];
        return parseFloat(responses[idx]) || 0;
    }
    
    if (!rules) {
        // Sum all questions in component and categorize
        let sum = 0;
        component.questionIndices.forEach(idx => {
            sum += parseFloat(responses[idx]) || 0;
        });
        return Math.min(sum, component.maxScore || 3);
    }
    
    // Handle complex scoring rules
    if (rules.type === 'categorize') {
        const idx = component.questionIndices[0];
        const value = parseFloat(responses[idx]) || 0;
        return categorizeValue(value, rules.ranges);
    }
    
    if (rules.type === 'sum-then-categorize') {
        let sum = 0;
        component.questionIndices.forEach(idx => {
            sum += parseFloat(responses[idx]) || 0;
        });
        return categorizeValue(sum, rules.ranges);
    }
    
    if (rules.type === 'efficiency-calculation') {
        // PSQI sleep efficiency: hours asleep / hours in bed
        const bedtimeIdx = component.questionIndices[0];
        const waketimeIdx = component.questionIndices[1];
        const hoursAsleepIdx = component.questionIndices[2];
        
        const hoursAsleep = parseFloat(responses[hoursAsleepIdx]) || 0;
        // Calculate hours in bed from bedtime/waketime (simplified)
        const bedtime = responses[bedtimeIdx];
        const waketime = responses[waketimeIdx];
        let hoursInBed = 8; // Default
        
        // Try to calculate if we have time values
        if (bedtime && waketime) {
            hoursInBed = calculateHoursInBed(bedtime, waketime);
        }
        
        const efficiency = hoursInBed > 0 ? (hoursAsleep / hoursInBed) * 100 : 100;
        return categorizeValue(efficiency, rules.ranges);
    }
    
    // Default
    return 0;
}

/**
 * Calculate hours in bed from time strings
 */
function calculateHoursInBed(bedtime, waketime) {
    try {
        const parseTime = (timeStr) => {
            const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
            if (!match) return null;
            let hours = parseInt(match[1]);
            const minutes = parseInt(match[2]) || 0;
            const period = match[3]?.toUpperCase();
            
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            
            return hours + minutes / 60;
        };
        
        const bed = parseTime(bedtime);
        const wake = parseTime(waketime);
        
        if (bed === null || wake === null) return 8;
        
        let hours = wake - bed;
        if (hours < 0) hours += 24; // Crossed midnight
        
        return Math.max(1, Math.min(24, hours));
    } catch {
        return 8;
    }
}

/**
 * Categorize a value based on ranges
 */
function categorizeValue(value, ranges) {
    for (const range of ranges) {
        if (value >= range.min && value <= range.max) {
            return range.score;
        }
    }
    return 0;
}

/**
 * Check conditional display logic
 */
function checkConditional(conditional, responses) {
    if (conditional.questionIndex !== undefined) {
        const value = responses[conditional.questionIndex];
        if (conditional.operator === '>') {
            return parseFloat(value) > conditional.value;
        }
        if (conditional.operator === '>=') {
            return parseFloat(value) >= conditional.value;
        }
        if (conditional.operator === '==') {
            return value == conditional.value;
        }
    }
    return true;
}

/**
 * Calculate maximum possible score from scale config
 */
function calculateMaxScore(scaleConfig) {
    if (scaleConfig.maxScore) return scaleConfig.maxScore;
    
    const questions = scaleConfig.questions || [];
    let maxScore = 0;
    
    questions.forEach(q => {
        if (q.scoredInTotal === false) return;
        if (q.options) {
            const maxOption = Math.max(...q.options.map(opt => {
                return opt.points !== undefined ? opt.points : (parseFloat(opt.value) || 0);
            }));
            maxScore += maxOption;
        } else if (q.maxValue !== undefined) {
            maxScore += q.maxValue;
        }
    });
    
    return maxScore;
}

/**
 * Get severity classification based on score and severity bands
 */
function getSeverityClassification(total, severityBands) {
    // Handle missing, null, or non-array severityBands
    if (!severityBands || !Array.isArray(severityBands) || severityBands.length === 0) {
        return { level: 'unknown', label: 'Not Classified' };
    }
    
    // Normalize band properties (support both min/max and minScore/maxScore)
    const normalizedBands = severityBands.map(band => ({
        ...band,
        min: band.min !== undefined ? band.min : band.minScore,
        max: band.max !== undefined ? band.max : band.maxScore,
        level: band.level || band.id || 'unknown',
        label: band.label || band.name || 'Unknown'
    }));
    
    // Sort bands by min value ascending
    const sortedBands = normalizedBands.sort((a, b) => (a.min || 0) - (b.min || 0));
    
    for (let i = sortedBands.length - 1; i >= 0; i--) {
        const band = sortedBands[i];
        if (total >= (band.min || 0) && (band.max === undefined || total <= band.max)) {
            return {
                level: band.level,
                label: band.label,
                description: band.description || '',
                color: band.color || null,
                recommendation: band.recommendation || ''
            };
        }
    }
    
    // Default to first band if no match
    return {
        level: sortedBands[0].level,
        label: sortedBands[0].label
    };
}

/**
 * Check for risk flags based on scale responses
 */
function checkRiskFlags(scaleId, responses, scaleConfig) {
    const flags = [];
    
    // Check defined risk rules in scale config
    if (scaleConfig.riskRules) {
        scaleConfig.riskRules.forEach(rule => {
            const questionValue = parseFloat(responses[rule.questionIndex]);
            
            if (!isNaN(questionValue)) {
                let triggered = false;
                
                switch (rule.operator) {
                    case '>=':
                        triggered = questionValue >= rule.threshold;
                        break;
                    case '>':
                        triggered = questionValue > rule.threshold;
                        break;
                    case '<=':
                        triggered = questionValue <= rule.threshold;
                        break;
                    case '<':
                        triggered = questionValue < rule.threshold;
                        break;
                    case '==':
                    case '===':
                        triggered = questionValue === rule.threshold;
                        break;
                }
                
                if (triggered) {
                    flags.push({
                        type: rule.type,
                        severity: rule.severity || 'high',
                        message: rule.message,
                        source: scaleId,
                        questionIndex: rule.questionIndex,
                        value: questionValue
                    });
                }
            }
        });
    }
    
    return flags;
}

/**
 * Main scoring function
 * Calculates score for a scale based on responses and configuration
 * 
 * @param {string} scaleId - Scale identifier
 * @param {Object} responses - Response values { questionIndex: value }
 * @param {Object} scaleConfig - Scale configuration from JSON
 * @returns {Object} Score data
 */
export function calculateScore(scaleId, responses, scaleConfig) {
    // Get scoring type (check both scoringType and scoringMethod, default to sum)
    const scoringType = scaleConfig.scoringType || scaleConfig.scoringMethod || 'sum';
    
    // Get the appropriate handler
    const handler = scoringHandlers[scoringType] || scoringHandlers.sum;
    
    // Calculate base score
    const scoreResult = handler(responses, scaleConfig);
    
    // Get severity classification
    const severity = getSeverityClassification(scoreResult.total, scaleConfig.severityBands);
    
    // Check for risk flags
    const riskFlags = checkRiskFlags(scaleId, responses, scaleConfig);
    
    // Build complete score object
    const scoreData = {
        scaleId,
        scaleName: scaleConfig.shortName || scaleConfig.id || scaleId,
        total: scoreResult.total,
        maxPossible: scoreResult.maxPossible,
        percentage: scoreResult.maxPossible > 0 
            ? Math.round((scoreResult.total / scoreResult.maxPossible) * 100) 
            : 0,
        severity,
        riskFlags,
        timestamp: new Date().toISOString(),
        ...scoreResult // Include any additional data from handler
    };
    
    // Store score in state
    StateManager.storeScore(scaleId, scoreData);
    
    // Add risk flags to state
    riskFlags.forEach(flag => StateManager.addRiskFlag(flag));
    
    return scoreData;
}

/**
 * Validate that all required questions are answered
 * 
 * @param {Object} responses - Response values
 * @param {Object} scaleConfig - Scale configuration
 * @returns {Object} Validation result { isValid, missingQuestions }
 */
export function validateResponses(responses, scaleConfig) {
    const questions = scaleConfig.questions || [];
    const missingQuestions = [];
    
    questions.forEach((question, index) => {
        const required = question.required !== false; // Default to required
        if (required && responses[index] === undefined) {
            missingQuestions.push({
                index,
                label: question.question || question.text || question.label || `Question ${index + 1}`
            });
        }
    });
    
    return {
        isValid: missingQuestions.length === 0,
        missingQuestions
    };
}

/**
 * Generate composite summary based on all scale scores
 * 
 * @param {Object} scores - All scale scores
 * @param {Object} conditionConfig - Condition configuration
 * @returns {string} Composite summary text
 */
export function generateCompositeSummary(scores, conditionConfig) {
    const summaryParts = [];
    const scaleResults = Object.values(scores);
    
    if (scaleResults.length === 0) {
        return 'No assessment data available.';
    }
    
    // Count severity levels
    const severityCounts = {};
    scaleResults.forEach(score => {
        const level = score.severity?.level || 'unknown';
        severityCounts[level] = (severityCounts[level] || 0) + 1;
    });
    
    // Generate summary based on overall pattern
    const highSeverity = (severityCounts.severe || 0) + (severityCounts['moderately-severe'] || 0);
    const moderateSeverity = severityCounts.moderate || 0;
    const lowSeverity = (severityCounts.mild || 0) + (severityCounts.minimal || 0);
    
    summaryParts.push(`Assessment completed with ${scaleResults.length} scale(s).`);
    
    if (highSeverity > 0) {
        summaryParts.push(`${highSeverity} scale(s) indicate severe or moderately-severe symptom levels, suggesting clinical attention may be warranted.`);
    }
    
    if (moderateSeverity > 0) {
        summaryParts.push(`${moderateSeverity} scale(s) show moderate symptom levels.`);
    }
    
    if (lowSeverity > 0) {
        summaryParts.push(`${lowSeverity} scale(s) indicate mild or minimal symptom levels.`);
    }
    
    // Check for risk flags
    const riskFlags = StateManager.getRiskFlags();
    if (riskFlags.length > 0) {
        const highRiskFlags = riskFlags.filter(f => f.severity === 'high');
        if (highRiskFlags.length > 0) {
            summaryParts.push(`⚠️ ${highRiskFlags.length} high-priority risk flag(s) detected requiring immediate clinical attention.`);
        }
    }
    
    return summaryParts.join(' ');
}

/**
 * Register a custom scoring handler
 * Allows extending the engine with new scoring types
 * 
 * @param {string} type - Scoring type name
 * @param {Function} handler - Handler function
 */
export function registerScoringHandler(type, handler) {
    if (typeof handler === 'function') {
        scoringHandlers[type] = handler;
    }
}

/**
 * Get all available scoring types
 * @returns {Array} List of scoring type names
 */
export function getScoringTypes() {
    return Object.keys(scoringHandlers);
}

// Export engine
export default {
    calculateScore,
    validateResponses,
    generateCompositeSummary,
    registerScoringHandler,
    getScoringTypes
};
