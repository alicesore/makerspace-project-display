// Configuration
const CONFIG = {
    cycleDuration: 15000, // 15 seconds per project set
    animationDuration: 500, // Animation duration in ms
    projectsPerPage: 9, // Number of projects to show at once (3x3 grid)
    dataUrl: './data/projects.json'
};

// Application state
let allProjects = [];
let currentProjectIndex = 0;
let isLoading = true;
let cycleTimer = null;

// DOM elements
const projectsGrid = document.getElementById('projects-grid');
const loadingIndicator = document.getElementById('loading');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const projectCounter = document.getElementById('project-counter');

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Makerspace Project Display...');
    
    // Debug: Check if elements are found
    console.log('Progress bar element:', progressBar);
    console.log('Progress fill element:', progressFill);
    console.log('Project counter element:', projectCounter);
    
    try {
        await loadProjects();
        if (allProjects.length > 0) {
            hideLoading();
            startProjectCycle();
        } else {
            showError('No projects found to display.');
        }
    } catch (error) {
        console.error('Failed to initialize application:', error);
        showError('Failed to load project data. Please try again later.');
    }
});

// Load projects from JSON file
async function loadProjects() {
    try {
        console.log('Loading project data...');
        const response = await fetch(CONFIG.dataUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        allProjects = data.projects || [];
        
        console.log(`Loaded ${allProjects.length} projects`);
        console.log('Project data:', data);
        
        // Filter out projects with missing essential data
        allProjects = allProjects.filter(project => 
            project.title && 
            project.url && 
            project.qrCode
        );
        
        console.log(`${allProjects.length} projects after filtering`);
        
    } catch (error) {
        console.error('Error loading projects:', error);
        throw error;
    }
}

// Create HTML for a project card
function createProjectCard(project) {
    // Clean up the title by removing the site suffix
    const cleanTitle = project.title
        .replace(' | Williams College: Makerspace & FabLab', '')
        .replace(' | Williams College Makerspace', '')
        .trim();
    
    // Format author
    const author = project.author || '';
    
    // Format tags
    const tagsHtml = project.tags && project.tags.length > 0 
        ? project.tags.slice(0, 4).map(tag => `<span class="project-tag">${tag}</span>`).join('')
        : '';
    
    // Handle main image
    const imageHtml = project.images && project.images.main 
        ? `<img src="${project.images.main}" alt="${cleanTitle}" onerror="this.parentElement.innerHTML='<div class=&quot;placeholder&quot;>No Image Available</div>'" />`
        : '<div class="placeholder">No Image Available</div>';
    
    return `
        <div class="project-card fade-in">
            <h3 class="project-title">
                <span class="project-title-text">${cleanTitle}</span>
            </h3>
            <div class="project-content">
                <div class="project-image">
                    ${imageHtml}
                </div>
                <div class="project-sidebar">
                    <div class="qr-code">
                        <img src="${project.qrCode}" alt="QR Code for ${cleanTitle}" />
                    </div>
                    ${author ? `<div class="project-author">By: ${author}</div>` : ''}
                    ${tagsHtml ? `<div class="project-tags">${tagsHtml}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

// Display a set of projects with wraparound to always show exactly 9 projects
function displayProjects(startIndex) {
    const projectsToShow = [];
    
    // Fill exactly 9 slots, wrapping around if necessary
    for (let i = 0; i < CONFIG.projectsPerPage; i++) {
        const projectIndex = (startIndex + i) % allProjects.length;
        projectsToShow.push(allProjects[projectIndex]);
    }
    
    console.log(`Displaying projects starting from index ${startIndex} (with wraparound)`);
    
    // Update project counter - show which "page" we're on
    const currentPage = Math.floor(startIndex / CONFIG.projectsPerPage) + 1;
    const totalPages = Math.ceil(allProjects.length / CONFIG.projectsPerPage);
    projectCounter.textContent = `${currentPage} / ${totalPages}`;
    
    // Clear current projects with fade out
    const currentCards = projectsGrid.querySelectorAll('.project-card');
    currentCards.forEach(card => card.classList.add('fade-out'));
    
    setTimeout(() => {
        // Create new project cards
        projectsGrid.innerHTML = projectsToShow
            .map(project => createProjectCard(project))
            .join('');
        
        // For 3x3 grid, we always maintain the same layout
        // No need to adjust grid-template-columns since it's fixed in CSS
        
    }, CONFIG.animationDuration / 2);
}

// Start the automatic project cycling
function startProjectCycle() {
    console.log('Starting project cycle...');
    
    // Display initial projects
    displayProjects(currentProjectIndex);
    
    // Set up automatic cycling
    cycleTimer = setInterval(() => {
        // Move to next set of projects
        currentProjectIndex += CONFIG.projectsPerPage;
        
        // Reset to beginning if we've reached or exceeded the end
        // This ensures smooth cycling through all projects
        if (currentProjectIndex >= allProjects.length) {
            currentProjectIndex = 0;
        }
        
        displayProjects(currentProjectIndex);
        resetProgressBar();
        
    }, CONFIG.cycleDuration);
    
    // Initialize progress bar
    resetProgressBar();
}

// Reset and restart the progress bar animation
function resetProgressBar() {
    console.log('Resetting progress bar...');
    
    if (!progressFill) {
        console.error('Progress fill element not found!');
        return;
    }
    
    // Clear any existing animations/transitions
    progressFill.classList.remove('animating', 'animating-keyframes');
    progressFill.style.width = '0%';
    progressFill.style.animation = 'none';
    progressFill.style.transition = 'none';
    
    // Force reflow
    void progressFill.offsetHeight;
    
    requestAnimationFrame(() => {
        setTimeout(() => {
            // Set up the transition
            progressFill.style.transition = `width ${CONFIG.cycleDuration}ms linear`;
            
            // Start the animation by changing width
            requestAnimationFrame(() => {
                progressFill.style.width = '100%';
            });
            
            console.log('Progress bar animation started with duration:', CONFIG.cycleDuration);
        }, 20);
    });
}

// Hide loading indicator
function hideLoading() {
    isLoading = false;
    loadingIndicator.classList.add('hidden');
    console.log('Loading complete');
}

// Show error message
function showError(message) {
    hideLoading();
    projectsGrid.innerHTML = `
        <div class="error-message">
            <h3>⚠️ Error</h3>
            <p>${message}</p>
        </div>
    `;
    console.error('Error displayed to user:', message);
}

// Handle page visibility changes to pause/resume cycling
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, pause cycling
        if (cycleTimer) {
            clearInterval(cycleTimer);
            cycleTimer = null;
        }
        console.log('Project cycling paused (page hidden)');
    } else {
        // Page is visible, resume cycling
        if (!isLoading && allProjects.length > 0 && !cycleTimer) {
            startProjectCycle();
            console.log('Project cycling resumed (page visible)');
        }
    }
});

// Handle keyboard shortcuts for manual control (useful for testing)
document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === ' ') {
        // Manual advance to next set
        event.preventDefault();
        currentProjectIndex += CONFIG.projectsPerPage;
        if (currentProjectIndex >= allProjects.length) {
            currentProjectIndex = 0;
        }
        displayProjects(currentProjectIndex);
        resetProgressBar();
        
        // Restart cycle timer
        if (cycleTimer) {
            clearInterval(cycleTimer);
            startProjectCycle();
        }
    } else if (event.key === 'ArrowLeft') {
        // Manual go to previous set
        event.preventDefault();
        currentProjectIndex -= CONFIG.projectsPerPage;
        if (currentProjectIndex < 0) {
            currentProjectIndex = Math.max(0, allProjects.length - CONFIG.projectsPerPage);
        }
        displayProjects(currentProjectIndex);
        resetProgressBar();
        
        // Restart cycle timer
        if (cycleTimer) {
            clearInterval(cycleTimer);
            startProjectCycle();
        }
    } else if (event.key === 'r' || event.key === 'R') {
        // Reload projects
        event.preventDefault();
        location.reload();
    }
});

// Handle window resize to adjust grid layout
window.addEventListener('resize', () => {
    // Re-display current projects to adjust layout
    if (!isLoading && allProjects.length > 0) {
        displayProjects(currentProjectIndex);
    }
});

// Add CSS for progress bar animation
const style = document.createElement('style');
style.textContent = `
    .progress-bar.animating::after {
        animation: progress-fill var(--progress-duration, 10s) linear forwards;
    }
`;
document.head.appendChild(style);

// Log configuration on startup
console.log('Configuration:', CONFIG);
console.log('Press SPACE or RIGHT ARROW to manually advance projects');
console.log('Press LEFT ARROW to go back');
console.log('Press R to reload');
