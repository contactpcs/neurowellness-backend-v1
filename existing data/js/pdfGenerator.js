/**
 * =============================================
 * PDF GENERATOR - Clean Clinical Report
 * Simple vertical layout - no overlapping
 * =============================================
 */

import * as StateManager from './stateManager.js';

let jsPDF = null;

/**
 * Initialize jsPDF from global scope
 */
function initJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) {
        jsPDF = window.jspdf.jsPDF;
        return true;
    }
    console.error('jsPDF not loaded');
    return false;
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Check and add page if needed
 */
function checkPageBreak(doc, y, neededHeight, margin) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + neededHeight > pageHeight - 25) {
        doc.addPage();
        return margin;
    }
    return y;
}

/**
 * Generate the PDF report
 */
export async function generateReport(options = {}) {
    if (!initJsPDF()) {
        throw new Error('PDF library not available');
    }
    
    const state = StateManager.getState();
    const scores = StateManager.getAllScores();
    
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;
    
    // ========================================
    // HEADER
    // ========================================
    
    // Logo
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(244, 121, 32);
    doc.text('SOZO', margin, y + 6);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('BRAIN CENTER', margin, y + 11);
    
    // Contact
    const rightX = pageWidth - margin;
    doc.setFontSize(8);
    doc.text('www.sozobraincenter.com', rightX, y + 7, { align: 'right' });
    
    y += 16;
    
    // Orange divider
    doc.setDrawColor(244, 121, 32);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    
    y += 8;
    
    // ========================================
    // PATIENT INFORMATION BOX
    // ========================================
    
    doc.setFillColor(248, 248, 248);
    doc.rect(margin, y, contentWidth, 22, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 22);
    
    const boxY = y + 5;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('PATIENT ID', margin + 4, boxY);
    doc.text('PATIENT NAME', margin + 50, boxY);
    doc.text('DATE', margin + 100, boxY);
    doc.text('CONDITION', margin + 140, boxY);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(state.patient_id || 'N/A', margin + 4, boxY + 6);
    doc.text(state.patient_name || 'N/A', margin + 50, boxY + 6);
    doc.text(formatDate(state.session_start), margin + 100, boxY + 6);
    
    // Get all condition labels (multi-condition support)
    let conditionText = 'N/A';
    if (state.conditions && state.conditions.length > 0) {
        conditionText = state.conditions.map(c => c.label).join(' + ');
    } else {
        conditionText = state.conditionLabel || state.condition || 'N/A';
    }
    const shortCondition = conditionText.length > 25 ? conditionText.substring(0, 23) + '...' : conditionText;
    doc.text(shortCondition, margin + 140, boxY + 6);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    
    y += 28;
    
    // ========================================
    // SECTION HEADER: ASSESSMENT RESULTS
    // ========================================
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Assessment Results', margin, y);
    
    y += 3;
    doc.setDrawColor(244, 121, 32);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 40, y);
    
    y += 8;
    
    // ========================================
    // RENDER EACH SCALE
    // ========================================
    
    const scaleIds = Object.keys(scores);
    
    scaleIds.forEach((scaleId, scaleIndex) => {
        const score = scores[scaleId];
        
        // Determine table height needed
        const hasSubscales = score.subscaleScores && Object.keys(score.subscaleScores).length > 0;
        const hasDomains = score.domainScores && Object.keys(score.domainScores).length > 0;
        
        let tableHeight = 30; // Base height
        if (hasSubscales) {
            const subscaleCount = Object.keys(score.subscaleScores).length;
            tableHeight = 20 + (subscaleCount * 7);
        } else if (hasDomains) {
            const domainCount = Object.keys(score.domainScores).length;
            tableHeight = 20 + (domainCount * 7);
        }
        
        // Check page break BEFORE drawing
        y = checkPageBreak(doc, y, tableHeight + 10, margin + 5);
        
        // Scale Box
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        
        // Scale Header Bar
        doc.setFillColor(50, 50, 50);
        doc.rect(margin, y, contentWidth, 8, 'F');
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(`${scaleIndex + 1}. ${scaleId}`, margin + 3, y + 5.5);
        
        y += 8;
        
        // Content area
        const contentStartY = y;
        
        if (hasSubscales) {
            y = renderSubscales(doc, score, margin, y, contentWidth);
        } else if (hasDomains) {
            y = renderDomains(doc, score, margin, y, contentWidth);
        } else {
            y = renderSimpleScore(doc, score, margin, y, contentWidth);
        }
        
        // Draw box around content
        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, contentStartY, contentWidth, y - contentStartY);
        
        y += 6;
    });
    
    // ========================================
    // FOOTER
    // ========================================
    
    const totalPages = doc.internal.getNumberOfPages();
    
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - 12;
        
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY, pageWidth - margin, footerY);
        
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text('SOZO Brain Center | Confidential Patient Report | GDPR Compliant', margin, footerY + 5);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY + 5, { align: 'right' });
    }
    
    return doc;
}

/**
 * Render subscales in vertical list
 */
function renderSubscales(doc, score, margin, y, contentWidth) {
    const items = score.subscaleScores;
    const itemsArray = Array.isArray(items) ? items : Object.values(items);
    
    // Column headers
    const col1 = margin + 3;
    const col2 = margin + 70;
    const col3 = margin + 100;
    const col4 = margin + 135;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('SUBSCALE', col1, y + 5);
    doc.text('PRE', col2, y + 5);
    doc.text('INTRA', col3, y + 5);
    doc.text('POST', col4, y + 5);
    
    y += 7;
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, margin + contentWidth, y);
    y += 2;
    
    // Subscale rows
    itemsArray.forEach((item, idx) => {
        const name = item.name || item.id || `Subscale ${idx + 1}`;
        const itemScore = item.score ?? item.weighted ?? item.raw ?? '-';
        const maxScore = item.maxScore || item.maxPossible || '?';
        const severity = item.severity?.label || '';
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(name, col1, y + 4);
        
        // Pre score
        doc.setFont('helvetica', 'bold');
        doc.text(`${itemScore}/${maxScore}`, col2, y + 4);
        
        // Severity if exists
        if (severity) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(severity, col2 + 18, y + 4);
        }
        
        y += 7;
    });
    
    // Total row
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, margin + contentWidth, y);
    y += 2;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('TOTAL', col1, y + 4);
    doc.text(`${score.total}/${score.maxPossible}`, col2, y + 4);
    
    if (score.severity?.label) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(score.severity.label, col2 + 18, y + 4);
    }
    
    y += 6;
    
    return y;
}

/**
 * Render domains in vertical list
 */
function renderDomains(doc, score, margin, y, contentWidth) {
    const items = score.domainScores;
    const itemsArray = Array.isArray(items) ? items : Object.values(items);
    
    const col1 = margin + 3;
    const col2 = margin + 80;
    const col3 = margin + 110;
    const col4 = margin + 140;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('DOMAIN', col1, y + 5);
    doc.text('PRE', col2, y + 5);
    doc.text('INTRA', col3, y + 5);
    doc.text('POST', col4, y + 5);
    
    y += 7;
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, margin + contentWidth, y);
    y += 2;
    
    itemsArray.forEach((item, idx) => {
        const name = item.name || item.id || `Domain ${idx + 1}`;
        const shortName = name.length > 25 ? name.substring(0, 23) + '..' : name;
        const itemScore = item.score ?? item.weighted ?? item.raw ?? '-';
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(shortName, col1, y + 4);
        
        doc.setFont('helvetica', 'bold');
        doc.text(String(itemScore), col2, y + 4);
        
        y += 7;
    });
    
    // Total
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, margin + contentWidth, y);
    y += 2;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('TOTAL SCORE', col1, y + 4);
    doc.text(`${score.total}/${score.maxPossible}`, col2, y + 4);
    
    if (score.severity?.label) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(score.severity.label, col2 + 25, y + 4);
    }
    
    y += 6;
    
    return y;
}

/**
 * Render simple single-score scale
 */
function renderSimpleScore(doc, score, margin, y, contentWidth) {
    const col1 = margin + 3;
    const col2 = margin + 50;
    const col3 = margin + 90;
    const col4 = margin + 130;
    
    // Header row
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('MEASURE', col1, y + 5);
    doc.text('PRE', col2, y + 5);
    doc.text('INTRA', col3, y + 5);
    doc.text('POST', col4, y + 5);
    
    y += 7;
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, margin + contentWidth, y);
    y += 2;
    
    // Score row
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text('Total Score', col1, y + 5);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`${score.total}/${score.maxPossible}`, col2, y + 5);
    
    y += 9;
    
    // Severity row
    if (score.severity?.label) {
        doc.setFont('helvetica', 'normal');
        doc.text('Severity', col1, y + 4);
        
        doc.setFont('helvetica', 'bold');
        doc.text(score.severity.label, col2, y + 4);
        
        y += 8;
    }
    
    return y;
}

/**
 * Download the PDF report
 */
export async function downloadReport(options = {}) {
    try {
        const doc = await generateReport(options);
        const state = StateManager.getState();
        
        const date = new Date().toISOString().split('T')[0];
        const patientId = state.patient_id || 'unknown';
        const condition = (state.condition || 'assessment').replace(/\s+/g, '-').toLowerCase();
        const filename = options.filename || `${patientId}_${condition}_${date}.pdf`;
        
        doc.save(filename);
        
        return true;
    } catch (error) {
        console.error('Failed to generate PDF:', error);
        throw error;
    }
}

/**
 * Get PDF as blob
 */
export async function getReportBlob(options = {}) {
    const doc = await generateReport(options);
    return doc.output('blob');
}

/**
 * Get PDF as data URI
 */
export async function getReportDataUri(options = {}) {
    const doc = await generateReport(options);
    return doc.output('datauristring');
}

export default {
    generateReport,
    downloadReport,
    getReportBlob,
    getReportDataUri
};
