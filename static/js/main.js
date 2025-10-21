// CCTV News Archive - JavaScript functionality

class NewsArchive {
    constructor() {
        this.searchIndex = null;
        this.init();
    }

    async init() {
        // Load search index if on a page that needs it
        if (window.location.pathname === '/' || window.location.pathname.includes('index.html')) {
            await this.loadSearchIndex();
            this.initSearch();
        }
        
        this.initEventListeners();
        this.initTheme();
    }

    async loadSearchIndex() {
        try {
            const response = await fetch('/api/search.json');
            const data = await response.json();
            this.searchIndex = data.index;
        } catch (error) {
            console.warn('Failed to load search index:', error);
        }
    }

    initSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        
        if (!searchInput || !searchResults) return;

        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.performSearch(e.target.value, searchResults);
            }, 300);
        });
    }

    performSearch(query, resultsContainer) {
        if (!query || query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        if (!this.searchIndex) {
            resultsContainer.innerHTML = '<p>搜索功能暂时不可用</p>';
            return;
        }

        const results = this.searchIndex.filter(item => {
            const searchText = `${item.title} ${item.brief}`.toLowerCase();
            return searchText.includes(query.toLowerCase());
        }).slice(0, 20); // Limit to 20 results

        if (results.length === 0) {
            resultsContainer.innerHTML = '<p>未找到相关新闻</p>';
            return;
        }

        resultsContainer.innerHTML = `
            <h3>搜索结果 (${results.length})</h3>
            <div class="search-results-list">
                ${results.map(item => `
                    <div class="search-result-item">
                        <h4><a href="/${item.url}">${this.highlightText(item.title, query)}</a></h4>
                        <p class="search-meta">
                            📅 ${this.formatDate(item.date)} | 
                            🏷️ ${item.category}
                        </p>
                        <p class="search-brief">${this.highlightText(item.brief, query)}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }

    highlightText(text, query) {
        if (!text || !query) return text;
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    formatDate(dateStr) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        return `${year}-${month}-${day}`;
    }

    initEventListeners() {
        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Back to top button
        this.createBackToTopButton();
    }

    createBackToTopButton() {
        const button = document.createElement('button');
        button.innerHTML = '↑';
        button.className = 'back-to-top';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #667eea;
            color: white;
            border: none;
            font-size: 20px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 1000;
        `;
        
        document.body.appendChild(button);

        // Show/hide button based on scroll position
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                button.style.opacity = '1';
            } else {
                button.style.opacity = '0';
            }
        });

        // Scroll to top when clicked
        button.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    initTheme() {
        // Simple dark mode toggle (if needed in the future)
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
        }
    }
}

// Global functions
window.searchNews = function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.focus();
    }
};

window.shareNews = function(title, url) {
    if (navigator.share) {
        navigator.share({
            title: title,
            url: url
        }).catch(err => console.log('Error sharing:', err));
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
            alert('链接已复制到剪贴板');
        }).catch(() => {
            // Further fallback: show the URL
            prompt('复制此链接:', url);
        });
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NewsArchive();
});

// Add search result styling
const searchResultCSS = `
.search-results-list {
    margin-top: 1rem;
}

.search-result-item {
    padding: 1rem;
    border-bottom: 1px solid #eee;
    margin-bottom: 1rem;
}

.search-result-item:last-child {
    border-bottom: none;
}

.search-result-item h4 {
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
}

.search-result-item h4 a {
    color: #667eea;
    text-decoration: none;
}

.search-result-item h4 a:hover {
    text-decoration: underline;
}

.search-meta {
    color: #666;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
}

.search-brief {
    color: #555;
    font-size: 0.9rem;
    line-height: 1.4;
}

mark {
    background-color: #ffeb3b;
    padding: 0 2px;
    border-radius: 2px;
}

.back-to-top:hover {
    background: #5a6fd8 !important;
    transform: translateY(-2px);
}
`;

// Inject CSS
const style = document.createElement('style');
style.textContent = searchResultCSS;
document.head.appendChild(style);