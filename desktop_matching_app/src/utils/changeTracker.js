const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Change Tracking System for Hierarchical Bundles
 * 
 * Tracks all modifications made to the bundle data including:
 * - Tone group assignments
 * - Field modifications (pitch, abbreviation, spelling, etc.)
 * - Words moved between sub-bundles
 * - Session metadata
 */

class ChangeTracker {
  constructor() {
    this.currentSession = null;
    this.changes = [];
    this.sessionStartTime = null;
    this.bundlePath = null;
    this.existingHistory = null;
  }

  /**
   * Initialize tracking for a bundle
   * @param {string} bundlePath - Path to the .tnset bundle
   * @param {object} existingHistory - Previously loaded change_history.json (if any)
   */
  initialize(bundlePath, existingHistory = null) {
    this.bundlePath = bundlePath;
    this.existingHistory = existingHistory;
    this.sessionStartTime = new Date().toISOString();
    this.changes = [];
    
    this.currentSession = {
      deviceId: this.getDeviceId(),
      deviceName: os.hostname(),
      platform: process.platform,
      timestamp: this.sessionStartTime,
      sessionDuration: null, // Will be calculated on save
      changes: []
    };
    
    console.log('[changeTracker] Initialized for device:', this.currentSession.deviceId);
  }

  /**
   * Get or create unique device identifier
   * Stored in app settings for persistence across sessions
   */
  getDeviceId() {
    const { app } = require('electron');
    const userDataPath = app.getPath('userData');
    const deviceIdFile = path.join(userDataPath, 'device-id.txt');
    
    if (fs.existsSync(deviceIdFile)) {
      return fs.readFileSync(deviceIdFile, 'utf8').trim();
    }
    
    // Generate new device ID: hostname + machine ID hash + timestamp
    const machineId = os.hostname() + os.platform() + os.arch();
    const hash = crypto.createHash('md5').update(machineId).digest('hex').substring(0, 8);
    const timestamp = Date.now().toString(36);
    const deviceId = `desktop-${hash}-${timestamp}`;
    
    fs.writeFileSync(deviceIdFile, deviceId, 'utf8');
    console.log('[changeTracker] Created new device ID:', deviceId);
    
    return deviceId;
  }

  /**
   * Log a change event
   * @param {object} change - Change details
   */
  logChange(change) {
    if (!this.currentSession) {
      console.warn('[changeTracker] No active session, change not logged:', change);
      return;
    }
    
    const changeRecord = {
      ...change,
      timestamp: new Date().toISOString()
    };
    
    this.changes.push(changeRecord);
    this.currentSession.changes.push(changeRecord);
    
    console.log('[changeTracker] Logged change:', changeRecord.action);
  }

  /**
   * Log tone group assignment
   */
  logToneGroupAssignment(subBundleId, ref, groupGuid, wordData) {
    this.logChange({
      subBundleId,
      ref,
      field: 'SurfaceMelodyId', // Or use configured field name
      oldValue: wordData.oldGroupId || '',
      newValue: groupGuid,
      action: 'assigned_to_group',
      metadata: {
        groupSize: wordData.groupSize || 1
      }
    });
  }

  /**
   * Log tone group removal
   */
  logToneGroupRemoval(subBundleId, ref, oldGroupGuid) {
    this.logChange({
      subBundleId,
      ref,
      field: 'SurfaceMelodyId',
      oldValue: oldGroupGuid,
      newValue: '',
      action: 'removed_from_group'
    });
  }

  /**
   * Log field modification
   */
  logFieldChange(subBundleId, ref, field, oldValue, newValue, action = 'field_modified') {
    this.logChange({
      subBundleId,
      ref,
      field,
      oldValue: oldValue || '',
      newValue: newValue || '',
      action
    });
  }

  /**
   * Log pitch transcription change
   */
  logPitchChange(subBundleId, ref, oldPitch, newPitch) {
    this.logFieldChange(subBundleId, ref, 'SurfaceMelodyPitch', oldPitch, newPitch, 'added_pitch_transcription');
  }

  /**
   * Log tone abbreviation change
   */
  logToneAbbreviationChange(subBundleId, ref, oldAbbr, newAbbr) {
    this.logFieldChange(subBundleId, ref, 'SurfaceMelody', oldAbbr, newAbbr, 'added_tone_abbreviation');
  }

  /**
   * Log exemplar flag change
   */
  logExemplarChange(subBundleId, ref, oldValue, newValue) {
    this.logFieldChange(subBundleId, ref, 'SurfaceMelodyEx', oldValue, newValue, 'marked_as_exemplar');
  }

  /**
   * Log user spelling/transcription change
   */
  logSpellingChange(subBundleId, ref, fieldName, oldValue, newValue) {
    this.logFieldChange(subBundleId, ref, fieldName, oldValue, newValue, 'updated_spelling');
  }

  /**
   * Log word moved between sub-bundles
   */
  logSubBundleMove(ref, oldSubBundleId, newSubBundleId, categoryField, oldValue, newValue) {
    this.logChange({
      ref,
      oldSubBundleId,
      newSubBundleId,
      field: categoryField,
      oldValue,
      newValue,
      action: 'moved_to_different_subbundle'
    });
  }

  /**
   * Log tone group reviewed/validated
   */
  logGroupReviewed(subBundleId, groupGuid) {
    this.logChange({
      subBundleId,
      groupGuid,
      field: 'SurfaceMelodyReviewed',
      oldValue: 'false',
      newValue: 'true',
      action: 'marked_reviewed'
    });
  }

  /**
   * Calculate session duration and finalize session
   */
  finalizeSession() {
    if (!this.currentSession) return;
    
    const endTime = new Date();
    const startTime = new Date(this.sessionStartTime);
    const durationMs = endTime - startTime;
    
    // Format as HH:MM:SS
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    
    this.currentSession.sessionDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.currentSession.changeCount = this.changes.length;
  }

  /**
   * Build complete change history including previous sessions
   */
  buildChangeHistory() {
    this.finalizeSession();
    
    const devices = this.existingHistory?.devices || [];
    
    // Only add current session if changes were made
    if (this.currentSession && this.changes.length > 0) {
      devices.push(this.currentSession);
    }
    
    return {
      devices,
      totalChanges: devices.reduce((sum, d) => sum + (d.changes?.length || 0), 0),
      lastModified: new Date().toISOString()
    };
  }

  /**
   * Save change history to bundle
   */
  async saveChangeHistory() {
    if (!this.bundlePath) {
      console.warn('[changeTracker] No bundle path set, cannot save change history');
      return null;
    }
    
    const history = this.buildChangeHistory();
    
    // If no changes were made in this or any previous session, don't create the file
    if (history.totalChanges === 0) {
      console.log('[changeTracker] No changes to save');
      return null;
    }
    
    const changeHistoryPath = path.join(this.bundlePath, 'change_history.json');
    
    try {
      fs.writeFileSync(changeHistoryPath, JSON.stringify(history, null, 2), 'utf8');
      console.log(`[changeTracker] Saved change history: ${history.totalChanges} total changes from ${history.devices.length} device(s)`);
      return history;
    } catch (error) {
      console.error('[changeTracker] Error saving change history:', error);
      throw error;
    }
  }

  /**
   * Load existing change history from bundle
   */
  static loadChangeHistory(bundlePath) {
    const changeHistoryPath = path.join(bundlePath, 'change_history.json');
    
    if (!fs.existsSync(changeHistoryPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(changeHistoryPath, 'utf8');
      const history = JSON.parse(content);
      console.log(`[changeTracker] Loaded existing change history: ${history.totalChanges} changes from ${history.devices?.length || 0} device(s)`);
      return history;
    } catch (error) {
      console.error('[changeTracker] Error loading change history:', error);
      return null;
    }
  }

  /**
   * Get summary of changes for display
   */
  getSessionSummary() {
    if (!this.currentSession) return null;
    
    const summary = {
      deviceId: this.currentSession.deviceId,
      changeCount: this.changes.length,
      startTime: this.sessionStartTime,
      actions: {}
    };
    
    // Count actions by type
    this.changes.forEach(change => {
      summary.actions[change.action] = (summary.actions[change.action] || 0) + 1;
    });
    
    return summary;
  }

  /**
   * Reset tracker (for new bundle or session)
   */
  reset() {
    this.currentSession = null;
    this.changes = [];
    this.sessionStartTime = null;
    this.bundlePath = null;
    this.existingHistory = null;
  }
}

// Singleton instance
const changeTracker = new ChangeTracker();

module.exports = {
  changeTracker,
  ChangeTracker
};
