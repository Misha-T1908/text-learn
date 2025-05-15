document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateBtn');
    const topicInput = document.getElementById('topic');
    const difficultySelect = document.getElementById('difficulty');
    const lengthSelect = document.getElementById('length');
    const generatedTextOutput = document.getElementById('generatedTextOutput');

    const selectedTextDisplay = document.getElementById('selectedTextDisplay');
    const getDetailsBtn = document.getElementById('getDetailsBtn');
    const translateLangSelect = document.getElementById('translateLang');
    
    const explanationOutputDiv = document.getElementById('explanationOutput'); 
    const translationOutputDiv = document.getElementById('translationOutput'); 
    
    let currentSelectedText = "";

    function sanitizeTextForHTML(text) {
        if (typeof text !== 'string') {
            text = String(text);
        }
        const temp = document.createElement('div');
        temp.textContent = text;
        return temp.innerHTML; // Escapes HTML, but preserves newlines as is for now
    }

    function formatForDisplay(text) {
        return sanitizeTextForHTML(text).replace(/\n/g, '<br>');
    }

    generateBtn.addEventListener('click', async () => {
        const topic = topicInput.value.trim();
        const difficulty = difficultySelect.value;
        const length = lengthSelect.value;

        if (!topic) {
            generatedTextOutput.innerHTML = `<p style="color: orange;">Please enter a topic.</p>`;
            return;
        }

        generatedTextOutput.innerHTML = '<p>Generating...</p>';
        getDetailsBtn.disabled = true;
        currentSelectedText = "";
        selectedTextDisplay.textContent = "-";
        explanationOutputDiv.innerHTML = '<h3>Explanation:</h3><p>Select text from above to get its explanation.</p>';
        translationOutputDiv.innerHTML = '<h3>Translation:</h3><p>Select text and choose a language to get its translation.</p>';

        try {
            const response = await fetch('/generate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, difficulty, length }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            generatedTextOutput.innerHTML = `<p>${formatForDisplay(data.text)}</p>`;
        } catch (error) {
            console.error('Error generating text:', error);
            generatedTextOutput.innerHTML = `<p style="color: red;">Error generating text: ${formatForDisplay(error.message)}</p>`;
        }
    });

    document.addEventListener('mouseup', (event) => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (generatedTextOutput.contains(selection.anchorNode) && generatedTextOutput.contains(selection.focusNode)) {
            if (selectedText.length > 0) {
                currentSelectedText = selectedText;
                selectedTextDisplay.innerHTML = `"${sanitizeTextForHTML(currentSelectedText)}"`;
                getDetailsBtn.disabled = false;
                explanationOutputDiv.innerHTML = '<h3>Explanation:</h3><p>Click \'Get Explanation & Translation\' to see details.</p>';
                translationOutputDiv.innerHTML = '<h3>Translation:</h3><p>Click \'Get Explanation & Translation\' to see details.</p>';
            }
        }
    });

    getDetailsBtn.addEventListener('click', async () => {
        if (!currentSelectedText) {
            alert("Please select some text from the generated content first.");
            return;
        }

        explanationOutputDiv.innerHTML = '<h3>Explanation:</h3><p>Fetching explanation...</p>';
        translationOutputDiv.innerHTML = '<h3>Translation:</h3><p>Fetching translation...</p>';
        getDetailsBtn.disabled = true;

        const targetLanguage = translateLangSelect.value;
        const fullContextText = generatedTextOutput.querySelector('p')?.textContent || ""; 

        try {
            const response = await fetch('/explain-translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: currentSelectedText,
                    language: targetLanguage,
                    context: fullContextText 
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            
            explanationOutputDiv.innerHTML = `<h3>Explanation:</h3><p>${formatForDisplay(data.explanation)}</p>`;
            
            // Use the new function to format translation output
            const translationHTML = generateTranslationListHTML(data.translation, targetLanguage);
            translationOutputDiv.innerHTML = `<h3>Translation (to ${sanitizeTextForHTML(targetLanguage)}):</h3>${translationHTML}`;

        } catch (error) {
            console.error('Error getting details:', error);
            explanationOutputDiv.innerHTML = `<h3>Explanation:</h3><p style="color: red;">Error fetching explanation: ${formatForDisplay(error.message)}</p>`;
            translationOutputDiv.innerHTML = `<h3>Translation:</h3><p style="color: red;">Error fetching translation: ${formatForDisplay(error.message)}</p>`;
        } finally {
            getDetailsBtn.disabled = false;
        }
    });

    function generateTranslationListHTML(rawTranslation, targetLanguage) {
        // First, clean up any obvious markdown or unwanted prefixes globally
        let cleanedLines = rawTranslation.split('\n').map(line => {
            line = line.trim();
            // Remove common markdown list markers like "* ", "- " or "**word**:"
            line = line.replace(/^\s*[\*\-]\s*(\*\*.*?\*\*|\*.*?\*|)/, ''); // Remove marker, keep bold/italic if any
            line = line.replace(/^\s*(\*\*.*?\*\*|\*.*?\*)/, '$1'); // Preserve bold/italic if it's the word itself

            // Attempt to remove AI's meta-commentary lines more aggressively
            const metaCommentaryPatterns = [
                /^\s*here are a few options:?/i,
                /^\s*the best translation .* depends on the context:?/i,
                /^\s*to choose the best option, please provide the sentence.*/i,
                /^\s*note:/i,
                /^\s*important:/i,
                /^\s*also consider:/i,
                /^\s*alternatively:/i,
                /^\s*possible translations include:?/i
            ];
            for (const pattern of metaCommentaryPatterns) {
                if (pattern.test(line)) {
                    return ""; // Mark line for removal
                }
            }
            return line.trim();
        }).filter(line => line.length > 0); // Remove empty lines resulting from cleanup


        if (cleanedLines.length === 0) {
            // If after cleaning, there's nothing, show the original (sanitized) or a message
            return `<p>${formatForDisplay(rawTranslation || "No translation available.")}</p>`;
        }
        
        // If only one line and it's short, or doesn't look like a list, display as simple paragraph
        if (cleanedLines.length === 1 && cleanedLines[0].length < 80 && !cleanedLines[0].includes('(') && !cleanedLines[0].includes(':')) {
             return `<p>${formatForDisplay(cleanedLines[0])}</p>`;
        }

        let listHTML = '<ul class="translation-list">';
        cleanedLines.forEach(line => {
            // Sanitize the cleaned line before adding to list
            let displayLine = sanitizeTextForHTML(line);
            
            // Try to find a nuance part in parentheses for styling
            displayLine = displayLine.replace(/(\(.*?\))/g, '<span class="translation-nuance">$1</span>');
            
            listHTML += `<li>${displayLine}</li>`;
        });
        listHTML += '</ul>';
        
        return listHTML;
    }

});