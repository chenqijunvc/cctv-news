// CCTV News Archive - JavaScript functionality

class NewsArchive {
    constructor() {
        this.searchIndex = null;
        this.currentPage = 1;
        this.pageSize = 10;
        this.init();
    }

    async init() {
        // Load search index if on a page that needs it
        if (window.location.pathname === '/' || window.location.pathname.includes('index.html')) {
            await this.loadSearchIndex();
            this.initSearch();
        }

        this.initEventListeners();
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
        const categoryFilter = document.getElementById('categoryFilter');
        const yearFilter = document.getElementById('yearFilter');
        const monthFilter = document.getElementById('monthFilter');
        const dateFilter = document.getElementById('dateFilter');
        const searchResults = document.getElementById('searchResults');
        
        if (!searchInput || !searchResults) return;

        const performSearch = () => {
            const query = searchInput.value;
            const category = categoryFilter ? categoryFilter.value : '';
            const year = yearFilter ? yearFilter.value : '';
            const month = monthFilter ? monthFilter.value : '';
            const date = dateFilter ? dateFilter.value : '';
            this.performSearch(query, category, year, month, date, searchResults);
        };

        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 300);
        });

        if (categoryFilter) {
            categoryFilter.addEventListener('change', performSearch);
        }

        if (yearFilter) {
            yearFilter.addEventListener('change', (e) => {
                const selectedYear = e.target.value;
                if (monthFilter) {
                    monthFilter.disabled = !selectedYear;
                    if (!selectedYear) {
                        monthFilter.value = '';
                        if (dateFilter) {
                            dateFilter.disabled = true;
                            dateFilter.value = '';
                        }
                    }
                }
                performSearch();
            });
        }

        if (monthFilter) {
            monthFilter.addEventListener('change', (e) => {
                const selectedMonth = e.target.value;
                if (dateFilter) {
                    dateFilter.disabled = !selectedMonth;
                    if (!selectedMonth) {
                        dateFilter.value = '';
                    }
                }
                performSearch();
            });
        }

        if (dateFilter) {
            dateFilter.addEventListener('change', performSearch);
        }
    }

    performSearch(query, category, year, month, date, resultsContainer) {
        if (!query || query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        if (!this.searchIndex) {
            resultsContainer.innerHTML = '<p>搜索功能暂时不可用</p>';
            return;
        }

        // Show loading state
        resultsContainer.innerHTML = '<p>🔍 搜索中...</p>';

        // Simulate async search for better UX
        setTimeout(() => {
            let results = this.searchIndex.filter(item => {
                const searchText = `${item.title} ${item.brief}`.toLowerCase();
                const matchesQuery = searchText.includes(query.toLowerCase());
                const matchesCategory = !category || item.category.includes(category);
                const matchesYear = !year || item.year === year;
                const matchesMonth = !month || item.month === month;
                const matchesDate = !date || item.day === date;
                return matchesQuery && matchesCategory && matchesYear && matchesMonth && matchesDate;
            });

            // Sort by date (latest first)
            results.sort((a, b) => b.date.localeCompare(a.date));

            this.displaySearchResults(results, query, resultsContainer);
        }, 200);
    }

    displaySearchResults(results, query, resultsContainer) {
        if (results.length === 0) {
            resultsContainer.innerHTML = '<p>未找到相关新闻</p>';
            return;
        }

        // Reset to first page
        this.currentPage = 1;
        this.renderPage(results, query, resultsContainer);
    }

    renderPage(results, query, resultsContainer) {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageResults = results.slice(start, end);
        const totalPages = Math.ceil(results.length / this.pageSize);

        const html = `
            <h3>搜索结果 (${results.length})</h3>
            <div class="search-results-list">
                ${pageResults.map(item => `
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
            ${totalPages > 1 ? this.renderPagination(totalPages) : ''}
        `;

        resultsContainer.innerHTML = html;

        // Add pagination event listeners
        if (totalPages > 1) {
            const prevBtn = resultsContainer.querySelector('.prev-page');
            const nextBtn = resultsContainer.querySelector('.next-page');

            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    if (this.currentPage > 1) {
                        this.currentPage--;
                        this.renderPage(results, query, resultsContainer);
                    }
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    if (this.currentPage < totalPages) {
                        this.currentPage++;
                        this.renderPage(results, query, resultsContainer);
                    }
                });
            }
        }
    }

    renderPagination(totalPages) {
        const hasPrev = this.currentPage > 1;
        const hasNext = this.currentPage < totalPages;

        return `
            <div class="pagination">
                <div class="page-info">
                    第 ${this.currentPage} 页，共 ${totalPages} 页
                </div>
                <div class="page-switch">
                    <button class="page-btn prev-page" ${!hasPrev ? 'disabled' : ''}>上一页</button>
                    <button class="page-btn next-page" ${!hasNext ? 'disabled' : ''}>下一页</button>
                </div>
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
    }

    createThemeToggle() {
        // Removed - no longer needed
    }

    toggleTheme() {
        // Removed - no longer needed
    }

    initTheme() {
        // Removed - no longer needed
    }

    createThemeToggle() {
        const header = document.querySelector('header');
        if (!header) return;

        const toggleButton = document.createElement('button');
        toggleButton.className = 'theme-toggle';
        toggleButton.innerHTML = '🌙';
        toggleButton.title = 'Toggle Dark Mode';
        toggleButton.addEventListener('click', () => this.toggleTheme());

        header.appendChild(toggleButton);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Update toggle button icon
        const toggleButton = document.querySelector('.theme-toggle');
        if (toggleButton) {
            toggleButton.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
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

window.copyQuote = function() {
    const quoteElement = document.querySelector('.daily-quote-card p');
    if (!quoteElement) {
        console.warn('Quote element not found');
        return;
    }

    const quoteText = quoteElement.textContent.trim();
    // Remove the Chinese quotes for sharing
    const cleanQuoteText = quoteText.replace(/^「|」$/g, '');
    
    // Get the date from the data source
    const sourceLink = document.querySelector('.news-source-link');
    let dateText = '';
    if (sourceLink) {
        dateText = sourceLink.textContent.trim();
    }
    
    const shareText = `"${cleanQuoteText}" 基于${dateText}新闻联播，获取每日分析@trendfollowing.ai`;

    // Copy to clipboard
    navigator.clipboard.writeText(shareText).then(() => {
        // Show feedback
        const button = document.querySelector('.btn-copy');
        if (button) {
            const originalHTML = button.innerHTML;
            button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.5 14 7-7"></path><path d="m8.5 10 7 7"></path></svg> 已复制!';
            button.style.background = 'var(--primary-light)';
            button.style.color = 'white';
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.style.background = '';
                button.style.color = '';
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy quote:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareText;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            const button = document.querySelector('.btn-copy');
            if (button) {
                const originalHTML = button.innerHTML;
                button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.5 14 7-7"></path><path d="m8.5 10 7 7"></path></svg> 已复制!';
                button.style.background = 'var(--primary-light)';
                button.style.color = 'white';
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                    button.style.background = '';
                    button.style.color = '';
                }, 2000);
            }
        } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
            alert('复制失败，请手动复制: ' + shareText);
        }
        document.body.removeChild(textArea);
    });
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

window.copyToClipboard = function(text, element) {
    navigator.clipboard.writeText(text).then(() => {
        // Show feedback on the clicked element
        if (element) {
            const originalText = element.textContent;
            element.textContent = '已复制!';
            element.style.background = 'var(--primary-light)';
            setTimeout(() => {
                element.textContent = originalText;
                element.style.background = '';
            }, 1500);
        }
        console.log('Copied to clipboard:', text);
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            if (element) {
                const originalText = element.textContent;
                element.textContent = '已复制!';
                element.style.background = 'var(--primary-light)';
                setTimeout(() => {
                    element.textContent = originalText;
                    element.style.background = '';
                }, 1500);
            }
            console.log('Fallback copy successful');
        } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
            alert('复制失败，请手动复制: ' + text);
        }
        document.body.removeChild(textArea);
    });
};

// Add tooltip functionality
function initTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(element => {
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(e) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = e.target.dataset.tooltip;
    document.body.appendChild(tooltip);
    
    const rect = e.target.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 5) + 'px';
}

function hideTooltip() {
    const tooltip = document.querySelector('.tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// Initialize tooltips when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NewsArchive();
    initTooltips();
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