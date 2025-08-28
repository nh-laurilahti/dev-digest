/**
 * Daily Dev Digest - Main JavaScript
 * HTMX configuration and interactive features
 */

// =============================================
// GLOBAL CONFIGURATION
// =============================================

// Configuration object
window.DailyDevDigest = {
  config: {
    pollingInterval: 3000, // 3 seconds
    toastTimeout: 5000, // 5 seconds
    apiBaseUrl: '/api/v1',
    retryDelay: 1000, // 1 second
    maxRetries: 3
  },
  state: {
    activePolling: new Map(), // Track active polling operations
    toastCounter: 0
  }
};

// =============================================
// HTMX CONFIGURATION
// =============================================

// Configure HTMX when it loads
document.addEventListener('DOMContentLoaded', function() {
  // Set default HTMX configuration
  if (typeof htmx !== 'undefined') {
    // Global configuration
    htmx.config.responseHandling = [{
      code: ".*", 
      swap: true
    }];
    htmx.config.requestTimeout = 30000; // 30 seconds
    htmx.config.refreshOnHistoryMiss = false;
    htmx.config.defaultSwapStyle = 'outerHTML';
    
    // Global request headers
    htmx.on('htmx:configRequest', function(evt) {
      // Add CSRF token
      if (window.csrfToken) {
        evt.detail.headers['X-CSRF-Token'] = window.csrfToken;
      }
      
      
      // Add content type for JSON requests
      if (evt.detail.requestConfig && (evt.detail.requestConfig.verb === 'post' || evt.detail.requestConfig.verb === 'patch')) {
        evt.detail.headers['Content-Type'] = 'application/json';
      }
    });
    
    // Global loading indicators
    htmx.on('htmx:beforeRequest', function(evt) {
      showLoadingState(evt.target);
      
      // Add loading class to trigger element
      if (evt.detail.requestConfig.triggeringEvent) {
        const trigger = evt.detail.requestConfig.triggeringEvent.target;
        if (trigger) {
          trigger.classList.add('loading');
        }
      }
    });
    
    htmx.on('htmx:afterRequest', function(evt) {
      hideLoadingState(evt.target);
      
      // Remove loading class
      if (evt.detail.requestConfig.triggeringEvent) {
        const trigger = evt.detail.requestConfig.triggeringEvent.target;
        if (trigger) {
          trigger.classList.remove('loading');
        }
      }
    });
    
    // Handle response errors
    htmx.on('htmx:responseError', function(evt) {
      console.error('HTMX Response Error:', evt.detail);
      
      let message = 'An error occurred. Please try again.';
      
      if (evt.detail.xhr.response) {
        try {
          const response = JSON.parse(evt.detail.xhr.response);
          message = response.error?.message || response.message || message;
        } catch (e) {
          // Use default message
        }
      }
      
      showToast(message, 'error');
    });
    
    // Handle success responses
    htmx.on('htmx:afterRequest', function(evt) {
      if (evt.detail.xhr.status >= 200 && evt.detail.xhr.status < 300) {
        try {
          const response = JSON.parse(evt.detail.xhr.response);
          if (response.message) {
            showToast(response.message, 'success');
          }
        } catch (e) {
          // Response might not be JSON, ignore
        }
      }
    });
    
    // Handle network errors
    htmx.on('htmx:sendError', function(evt) {
      console.error('HTMX Network Error:', evt.detail);
      showToast('Network error. Please check your connection.', 'error');
    });
    
    console.log('HTMX configured successfully');
  }
  
  // Initialize other features
  initializeApp();
});

// =============================================
// JOB POLLING SYSTEM
// =============================================

class JobPoller {
  constructor(jobId, options = {}) {
    this.jobId = jobId;
    this.options = {
      interval: options.interval || DailyDevDigest.config.pollingInterval,
      onProgress: options.onProgress || function() {},
      onComplete: options.onComplete || function() {},
      onError: options.onError || function() {},
      onStatusChange: options.onStatusChange || function() {}
    };
    
    this.isPolling = false;
    this.pollCount = 0;
    this.lastStatus = null;
    this.intervalId = null;
  }
  
  start() {
    if (this.isPolling) return;
    
    this.isPolling = true;
    DailyDevDigest.state.activePolling.set(this.jobId, this);
    
    console.log(`Starting job polling for job ${this.jobId}`);
    
    // Poll immediately, then set interval
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.options.interval);
  }
  
  stop() {
    if (!this.isPolling) return;
    
    this.isPolling = false;
    DailyDevDigest.state.activePolling.delete(this.jobId);
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log(`Stopped job polling for job ${this.jobId}`);
  }
  
  async poll() {
    if (!this.isPolling) return;
    
    try {
      this.pollCount++;
      
      const response = await fetch(`${DailyDevDigest.config.apiBaseUrl}/jobs/${this.jobId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const job = data.data?.job;
      
      if (!job) {
        throw new Error('Invalid job response format');
      }
      
      // Check for status change
      if (job.status !== this.lastStatus) {
        this.options.onStatusChange(job, this.lastStatus);
        this.lastStatus = job.status;
      }
      
      // Handle progress updates
      if (job.progress !== undefined) {
        this.options.onProgress(job);
      }
      
      // Handle completion
      if (job.status === 'COMPLETED') {
        this.options.onComplete(job);
        this.stop();
      } else if (job.status === 'FAILED' || job.status === 'CANCELLED') {
        this.options.onError(job);
        this.stop();
      }
      
      console.log(`Job ${this.jobId} poll ${this.pollCount}:`, job.status, job.progress || 0);
      
    } catch (error) {
      console.error(`Job polling error for ${this.jobId}:`, error);
      this.options.onError({ error: error.message });
      
      // Stop polling on repeated failures
      if (this.pollCount > 10) {
        this.stop();
      }
    }
  }
}

// Convenience function to start job polling
function startJobPolling(jobId, options = {}) {
  // Stop existing polling for this job
  const existing = DailyDevDigest.state.activePolling.get(jobId);
  if (existing) {
    existing.stop();
  }
  
  const poller = new JobPoller(jobId, options);
  poller.start();
  return poller;
}

// Stop all active polling
function stopAllPolling() {
  DailyDevDigest.state.activePolling.forEach(poller => poller.stop());
  DailyDevDigest.state.activePolling.clear();
}

// =============================================
// TOAST NOTIFICATION SYSTEM
// =============================================

function createToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'info', duration = null) {
  const container = createToastContainer();
  const toastId = `toast-${++DailyDevDigest.state.toastCounter}`;
  
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = `toast toast--${type} toast--entering`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  
  const icon = getToastIcon(type);
  
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    </div>
    <button class="toast-close" aria-label="Close notification" onclick="removeToast('${toastId}')">
      <span aria-hidden="true">&times;</span>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.remove('toast--entering');
    toast.classList.add('toast--visible');
  });
  
  // Auto-remove toast
  const toastDuration = duration || DailyDevDigest.config.toastTimeout;
  setTimeout(() => removeToast(toastId), toastDuration);
  
  return toastId;
}

function removeToast(toastId) {
  const toast = document.getElementById(toastId);
  if (!toast) return;
  
  toast.classList.add('toast--leaving');
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

function getToastIcon(type) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    loading: '⏳'
  };
  return icons[type] || icons.info;
}

// =============================================
// LOADING STATES
// =============================================

function showLoadingState(element) {
  if (!element) return;
  
  // Add loading class
  element.classList.add('loading');
  
  // For buttons, show spinner
  if (element.tagName === 'BUTTON' || element.classList.contains('btn')) {
    const spinner = element.querySelector('.btn-spinner, .loading-spinner');
    if (spinner) {
      spinner.style.display = 'inline-block';
    }
    
    const text = element.querySelector('.btn-text');
    if (text) {
      text.dataset.originalText = text.textContent;
      text.textContent = 'Loading...';
    }
  }
}

function hideLoadingState(element) {
  if (!element) return;
  
  // Remove loading class
  element.classList.remove('loading');
  
  // For buttons, hide spinner
  if (element.tagName === 'BUTTON' || element.classList.contains('btn')) {
    const spinner = element.querySelector('.btn-spinner, .loading-spinner');
    if (spinner) {
      spinner.style.display = 'none';
    }
    
    const text = element.querySelector('.btn-text');
    if (text && text.dataset.originalText) {
      text.textContent = text.dataset.originalText;
      delete text.dataset.originalText;
    }
  }
}

// =============================================
// FORM UTILITIES
// =============================================

function validateForm(form) {
  const errors = [];
  const requiredFields = form.querySelectorAll('[required]');
  
  requiredFields.forEach(field => {
    if (!field.value.trim()) {
      errors.push({
        field: field.name || field.id,
        message: `${field.labels?.[0]?.textContent || field.name} is required`
      });
    }
  });
  
  // Email validation
  const emailFields = form.querySelectorAll('input[type="email"]');
  emailFields.forEach(field => {
    if (field.value && !isValidEmail(field.value)) {
      errors.push({
        field: field.name || field.id,
        message: 'Please enter a valid email address'
      });
    }
  });
  
  return errors;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFieldErrors(form, errors) {
  // Clear existing errors
  form.querySelectorAll('.form-error').forEach(error => error.remove());
  form.querySelectorAll('.form-input--error').forEach(input => {
    input.classList.remove('form-input--error');
  });
  
  errors.forEach(error => {
    const field = form.querySelector(`[name="${error.field}"], #${error.field}`);
    if (field) {
      field.classList.add('form-input--error');
      
      const errorElement = document.createElement('div');
      errorElement.className = 'form-error';
      errorElement.textContent = error.message;
      
      field.parentNode.appendChild(errorElement);
    }
  });
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / 60000);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
  if (diffInHours < 24) return `${diffInHours} hours ago`;
  if (diffInDays < 7) return `${diffInDays} days ago`;
  
  return formatDate(dateString);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// =============================================
// INITIALIZATION
// =============================================

function initializeApp() {
  console.log('Initializing Daily Dev Digest app...');
  
  // Initialize existing functionality
  initMobileMenu();
  initDropdowns();
  initAlertDismissal();
  
  // Initialize HTMX-specific features
  initFormValidation();
  initAutoRefresh();
  initFormToggleCards();
  
  console.log('App initialized successfully');
}

function initMobileMenu() {
  const toggleButton = document.querySelector('.navbar-toggle');
  const menu = document.querySelector('.navbar-menu');
  
  if (toggleButton && menu) {
    toggleButton.addEventListener('click', function() {
      const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
      toggleButton.setAttribute('aria-expanded', !isExpanded);
      menu.classList.toggle('navbar-menu--open', !isExpanded);
    });
  }
}

function initDropdowns() {
  const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
  dropdownToggles.forEach(toggle => {
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      const dropdown = this.closest('.dropdown');
      const menu = dropdown.querySelector('.dropdown-menu');
      const isExpanded = this.getAttribute('aria-expanded') === 'true';
      
      // Close other dropdowns
      document.querySelectorAll('.dropdown-menu').forEach(otherMenu => {
        if (otherMenu !== menu) {
          otherMenu.classList.remove('dropdown-menu--open');
          otherMenu.closest('.dropdown').querySelector('.dropdown-toggle').setAttribute('aria-expanded', 'false');
        }
      });
      
      this.setAttribute('aria-expanded', !isExpanded);
      menu.classList.toggle('dropdown-menu--open', !isExpanded);
    });
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.remove('dropdown-menu--open');
        menu.closest('.dropdown').querySelector('.dropdown-toggle').setAttribute('aria-expanded', 'false');
      });
    }
  });
}

function initAlertDismissal() {
  const alertCloses = document.querySelectorAll('.alert-close');
  alertCloses.forEach(closeBtn => {
    closeBtn.addEventListener('click', function() {
      this.closest('.alert').remove();
    });
  });
  
  // Auto-dismiss success and info alerts
  const autoDismissAlerts = document.querySelectorAll('.alert--success, .alert--info');
  autoDismissAlerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  });
}

function initFormValidation() {
  // Add client-side validation to forms
  document.querySelectorAll('form[novalidate]').forEach(form => {
    form.addEventListener('submit', function(e) {
      if (!this.hasAttribute('data-htmx-skip-validation')) {
        const errors = validateForm(this);
        if (errors.length > 0) {
          e.preventDefault();
          showFieldErrors(this, errors);
          showToast('Please correct the errors in the form', 'error');
        }
      }
    });
  });
}

function initAutoRefresh() {
  // Auto-refresh elements with data-auto-refresh attribute
  document.querySelectorAll('[data-auto-refresh]').forEach(element => {
    const interval = parseInt(element.dataset.autoRefresh) || 30000; // default 30s
    
    setInterval(() => {
      if (typeof htmx !== 'undefined' && element.hasAttribute('hx-get')) {
        htmx.trigger(element, 'refresh');
      }
    }, interval);
  });
}

function initFormToggleCards() {
  const toggleCards = document.querySelectorAll('.form-toggle--card');
  
  toggleCards.forEach(card => {
    card.addEventListener('click', function(e) {
      // Don't handle if click was directly on checkbox or label
      if (e.target.type === 'checkbox' || e.target.tagName === 'LABEL') {
        return;
      }
      
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        // Trigger change event to maintain form functionality
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

// =============================================
// CLEANUP
// =============================================

// Clean up when page is unloaded
window.addEventListener('beforeunload', function() {
  stopAllPolling();
});

// Make functions globally available
window.DailyDevDigest.showToast = showToast;
window.DailyDevDigest.removeToast = removeToast;
window.DailyDevDigest.startJobPolling = startJobPolling;
window.DailyDevDigest.stopAllPolling = stopAllPolling;
window.DailyDevDigest.formatDate = formatDate;
window.DailyDevDigest.formatRelativeTime = formatRelativeTime;

console.log('Daily Dev Digest main.js loaded');
// =============================================
// PROMPT EDITOR FUNCTIONALITY
// =============================================

/**
 * Initialize summary style prompt editor
 */
function initializeSummaryStyles() {
  const styleRadios = document.querySelectorAll('input[name="summaryStyle"]');
  const summaryPrompt = document.getElementById('summaryPrompt');
  const viewVariablesBtn = document.getElementById('viewVariablesBtn');
  const closeVariablesBtn = document.getElementById('closeVariablesBtn');
  const templateVariables = document.getElementById('templateVariables');

  // Prompt templates for each style
  const promptTemplates = {
    'concise': 'You are a senior software engineer writing a concise technical digest for developers. Write in a factual, professional tone like a technical report. Focus on actual repository activity and concrete changes. Always create clear subtitles using HTML <h2> headers with appropriate emojis for main sections.\n\nCreate a concise technical summary of this repository activity:\n- Write exactly like a technical report about this repository\n- Use HTML <h2> headers with emojis for main sections (e.g., <h2>📈 Development Activity</h2>, <h2>🔧 Key Changes</h2>, <h2>👥 Team Performance</h2>)\n- Use appropriate technical report emojis: 📊 for metrics, 🚀 for deployments, 🐛 for bugs, ⚡ for performance, 🔒 for security, etc.\n- Keep each section 1-2 sentences maximum in <p> tags\n- Focus ONLY on what actually happened in the repository\n- Mention specific PR numbers, contributor names, and technical details\n- No creative storytelling - stick to facts about the codebase\n- Total length: 3-4 short paragraphs maximum\n- Use HTML formatting throughout (no markdown)',
    'frontend': 'You are a frontend technical lead writing a digest about UI/UX and frontend development activity. Write like a technical report specifically focused on user-facing changes and frontend architecture. Always use HTML <h2> headers with appropriate emojis for main sections to enable sidebar navigation. Focus on concrete frontend changes in the repository.\n\nAnalyze this repository activity from a frontend development perspective:\n- Write like a technical report about frontend/UI changes\n- Use HTML <h2> headers with emojis for sections (e.g., <h2>🎨 UI/UX Updates</h2>, <h2>🏗️ Frontend Architecture</h2>, <h2>✨ User Experience Improvements</h2>)\n- Use frontend-focused emojis: 🎨 for design, 📱 for mobile, 💻 for desktop, 🚀 for performance, ♿ for accessibility, 🎭 for animations, etc.\n- Focus specifically on user-facing changes, component updates, styling modifications in <p> tags\n- Mention specific files, components, or UI elements that were changed\n- Highlight performance improvements, accessibility updates, or design system changes\n- Include actual impact on users and developers\n- Keep technical and factual - no dramatic language\n- Total length: 4-5 paragraphs maximum\n- Use HTML formatting throughout (no markdown)',
    'engaging-story': 'You are a technical journalist writing an engaging but factual article about software development activity. Write like a technical report with engaging language covering this repository. Use engaging language but focus entirely on what actually happened in the codebase. Always use HTML <h2> headers with appropriate emojis for main sections. No overly dramatic storytelling - keep it professional and repository-focused.\n\nWrite an engaging technical article about this development period:\n- Write like an engaging technical report about software development\n- Use HTML <h2> headers with emojis for sections (e.g., <h2>🚀 Development Highlights</h2>, <h2>💻 Code Changes</h2>, <h2>👥 Team Activity</h2>)\n- Use engaging technical emojis: 🚀 for launches, 💻 for code, 🔬 for research, 🎯 for goals, 🏆 for achievements, ⚡ for improvements, etc.\n- Engaging but professional tone - like TechCrunch or Ars Technica covering this repo\n- Focus on the technical work that was accomplished\n- Mention specific contributors, PR numbers, and code changes in <p> tags\n- Describe the impact of changes on the codebase and users\n- No dramatic storylines - focus on the actual development work\n- Include what challenges were solved and features added\n- Total length: 4-6 paragraphs maximum\n- Use HTML formatting throughout (no markdown)',
    'executive': 'You are writing an executive brief for business leaders and stakeholders. Focus entirely on business outcomes, team productivity, and strategic insights. Use business language, avoid technical jargon. Always use HTML <h2> headers with appropriate business emojis for clear section organization. Present concrete results and actionable insights.\n\nProvide an executive summary of development activity:\n- Write like a business report for executives and stakeholders\n- Use HTML <h2> headers with business emojis for sections (e.g., <h2>📈 Development Performance</h2>, <h2>🎯 Business Deliverables</h2>, <h2>👥 Team Productivity</h2>, <h2>💡 Strategic Recommendations</h2>)\n- Use business-focused emojis: 📊 for metrics, 💰 for cost savings, ⚡ for efficiency, 🎯 for goals, 📈 for growth, 🏆 for achievements, etc.\n- Focus on business value delivered and operational metrics in <p> tags\n- Translate technical activity into business outcomes\n- Mention cost savings, efficiency gains, customer impact where relevant\n- Include quantifiable results and percentage improvements\n- Address any risks or concerns from a business perspective\n- Provide 2-3 strategic recommendations for leadership\n- Use business terminology - "deliverables" not "PRs", "productivity" not "commits"\n- Total length: 4-5 paragraphs maximum\n- Use HTML formatting throughout (no markdown)',
    'technical': 'You are a senior technical architect writing a detailed analysis for engineering teams. Focus on architectural patterns, code quality metrics, technical challenges, and engineering best practices. Use HTML <h2> headers with appropriate technical emojis for clear organization. Write like a technical lead analyzing the codebase and development patterns.\n\nProvide a technical deep dive analysis:\n- Write like a senior technical architect\'s analysis for engineering teams\n- Use HTML <h2> headers with technical emojis for sections (e.g., <h2>🔍 Code Quality Analysis</h2>, <h2>🏗️ Architectural Changes</h2>, <h2>⚙️ Development Patterns</h2>, <h2>💡 Technical Recommendations</h2>)\n- Use technical emojis: 🔍 for analysis, 🏗️ for architecture, ⚙️ for systems, 🧪 for testing, 📊 for metrics, 🔒 for security, ⚡ for performance, etc.\n- Focus on technical debt, code patterns, and architectural implications in <p> tags\n- Analyze development practices and code review effectiveness\n- Discuss specific technical challenges and how they were addressed\n- Mention testing patterns, refactoring efforts, and performance improvements\n- Include concrete technical recommendations for the engineering team\n- Discuss impact on system architecture and maintainability\n- Analyze complexity trends and code health metrics\n- Address any technical risks and suggest mitigation strategies\n- Total length: 5-7 paragraphs with technical depth\n- Use HTML formatting throughout (no markdown)',
    'custom': 'Write your custom prompt here to define how the AI should write your digest summary...\n\nIMPORTANT REQUIREMENTS:\n- Always use HTML <h2> headers with emojis for main sections (for sidebar navigation)\n- Focus on what actually happened in the repository\n- Be specific about contributors, PR numbers, and technical changes\n- Write like a technical report, not creative fiction\n- Use HTML formatting throughout (no markdown)\n- Include appropriate emojis for technical reports\n\nInclude specific requirements about:\n- Tone and style (professional, engaging, technical, business-focused)\n- Focus areas (frontend, backend, testing, security, performance)\n- Target audience (developers, executives, product managers)\n- Format preferences (length, structure, level of detail)\n- Key metrics to highlight (PRs, contributors, lines changed, review coverage)\n- Specific emojis to use (📊 for metrics, 🚀 for deployments, 🐛 for bugs, etc.)'
  };

  // Update prompt text area when style changes
  function updatePromptText(selectedStyle) {
    if (summaryPrompt && promptTemplates[selectedStyle]) {
      summaryPrompt.value = promptTemplates[selectedStyle];
      // Auto-resize textarea if needed
      summaryPrompt.style.height = 'auto';
      summaryPrompt.style.height = summaryPrompt.scrollHeight + 'px';
    }
  }

  // Add event listeners to radio buttons
  styleRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.checked) {
        updatePromptText(this.value);
      }
    });
  });

  // Template variables modal functionality
  if (viewVariablesBtn) {
    viewVariablesBtn.addEventListener('click', function(e) {
      e.preventDefault();
      showTemplateVariables();
    });
  }

  if (closeVariablesBtn) {
    closeVariablesBtn.addEventListener('click', function() {
      hideTemplateVariables();
    });
  }

  // Close variables modal when clicking outside
  if (templateVariables) {
    templateVariables.addEventListener('click', function(e) {
      if (e.target === this) {
        hideTemplateVariables();
      }
    });
  }

  // Escape key to close variables modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && templateVariables && templateVariables.style.display !== 'none') {
      hideTemplateVariables();
    }
  });

  function showTemplateVariables() {
    if (templateVariables) {
      templateVariables.style.display = 'block';
      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'variables-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
      `;
      overlay.addEventListener('click', hideTemplateVariables);
      document.body.appendChild(overlay);
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }
  }

  function hideTemplateVariables() {
    if (templateVariables) {
      templateVariables.style.display = 'none';
      // Remove overlay
      const overlay = document.querySelector('.variables-overlay');
      if (overlay) {
        overlay.remove();
      }
      // Restore body scroll
      document.body.style.overflow = '';
    }
  }

  // Initialize with default selection
  const checkedRadio = document.querySelector('input[name="summaryStyle"]:checked');
  if (checkedRadio) {
    updatePromptText(checkedRadio.value);
  }
}

// Initialize summary styles when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  initializeSummaryStyles();
});

// Make function globally available
window.DailyDevDigest.initializeSummaryStyles = initializeSummaryStyles;
