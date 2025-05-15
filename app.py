import os
import requests
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-1.5-flash-latest"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

def get_difficulty_prompt_text(difficulty):
    if difficulty == "easy":
        return "Use simple vocabulary and sentence structures, suitable for an A2 CEFR level learner."
    elif difficulty == "medium":
        return "Use moderately complex vocabulary and sentence structures, suitable for a B1/B2 CEFR level learner."
    elif difficulty == "hard":
        return "Use advanced vocabulary, complex sentence structures, and nuanced language, suitable for a C1/C2 CEFR level learner or native speaker."
    return ""

def call_gemini_api(prompt_text, safety_settings=None, generation_config=None):
    if not GEMINI_API_KEY:
        return "Error: GEMINI_API_KEY not configured."

    headers = {"Content-Type": "application/json"}
    payload = {"contents": [{"parts": [{"text": prompt_text}]}]}
    if safety_settings:
        payload["safetySettings"] = safety_settings
    if generation_config:
        payload["generationConfig"] = generation_config

    try:
        response = requests.post(GEMINI_API_URL, headers=headers, data=json.dumps(payload), timeout=60)
        response.raise_for_status()
        response_json = response.json()

        if "candidates" in response_json and \
           len(response_json["candidates"]) > 0 and \
           "content" in response_json["candidates"][0] and \
           "parts" in response_json["candidates"][0]["content"] and \
           len(response_json["candidates"][0]["content"]["parts"]) > 0 and \
           "text" in response_json["candidates"][0]["content"]["parts"][0]:
            return response_json["candidates"][0]["content"]["parts"][0]["text"].strip()
        elif "promptFeedback" in response_json and "blockReason" in response_json["promptFeedback"]:
            block_reason = response_json["promptFeedback"]["blockReason"]
            safety_ratings = response_json["promptFeedback"].get('safetyRatings', '')
            print(f"Gemini API content blocked: {block_reason}, SafetyRatings: {safety_ratings}")
            return f"Blocked by API: {block_reason}. Please try a different query."
        else:
            print(f"Unexpected Gemini API response structure: {response_json}")
            return "Error: Could not parse text from Gemini API response."
    except requests.exceptions.Timeout:
        print("Gemini API request timed out.")
        return "Error: The request to the AI model timed out. Please try again."
    except requests.exceptions.RequestException as e:
        print(f"Gemini API request failed: {e}")
        error_details = ""
        if e.response is not None:
            try:
                error_details = e.response.json()
                print(f"Error response from Gemini: {error_details}")
            except json.JSONDecodeError:
                error_details = e.response.text
                print(f"Error text response from Gemini: {error_details}")
        return f"Error: API request failed. {str(e)}."
    except Exception as e:
        print(f"An unexpected error occurred calling Gemini API: {e}")
        return f"Error: An unexpected error occurred. {str(e)}"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate-text', methods=['POST'])
def generate_text():
    if not GEMINI_API_KEY:
        return jsonify({'error': "API Key not configured on server."}), 500
    data = request.json
    topic = data.get('topic', 'a random interesting story')
    difficulty = data.get('difficulty', 'medium')
    length_preference = data.get('length', 'a short paragraph')
    difficulty_instruction = get_difficulty_prompt_text(difficulty)
    prompt = f"{difficulty_instruction} Generate text about {length_preference} long on the topic: {topic}"
    print(f"Generating text with prompt (first 100 chars): {prompt[:100]}...")
    generated_text = call_gemini_api(prompt)
    if generated_text.startswith("Error:") or generated_text.startswith("Blocked by API:"):
        return jsonify({'error': generated_text}), 500
    return jsonify({'text': generated_text})

@app.route('/explain-translate', methods=['POST'])
def explain_translate():
    if not GEMINI_API_KEY:
        return jsonify({'error': "API Key not configured on server."}), 500
    data = request.json
    selected_text = data.get('text')
    target_language = data.get('language', 'Spanish')
    context_text = data.get('context', '')

    if not selected_text:
        return jsonify({'error': 'No text provided for explanation/translation'}), 400

    explanation = "Could not fetch explanation."
    translation = "Could not fetch translation."

    # 1. Get Explanation
    explanation_prompt_parts = ["Explain the following word or phrase clearly and concisely."]
    if context_text:
        max_context_len = 500
        truncated_context = context_text[:max_context_len] + ("..." if len(context_text) > max_context_len else "")
        explanation_prompt_parts.append(f"It appeared in the following context (use this for nuance if helpful): \"{truncated_context}\".")
    explanation_prompt_parts.append(f"The specific word/phrase to explain is: \"{selected_text}\". Provide a definition and, if applicable, an example of its usage.")
    explanation_prompt = " ".join(explanation_prompt_parts)
    print(f"Getting explanation for \"{selected_text}\" with prompt (first 100 chars): {explanation_prompt[:100]}...")
    explanation_result = call_gemini_api(explanation_prompt)
    if explanation_result.startswith("Error:") or explanation_result.startswith("Blocked by API:"):
        explanation = f"Explanation failed: {explanation_result}"
    else:
        explanation = explanation_result

    # 2. Get Translation
    # --- MODIFIED PROMPT FOR TRANSLATION ---
    translation_prompt = (
        f"Provide a list of the most common and direct translations in {target_language} "
        f"for the English word/phrase: \"{selected_text}\". "
        f"For each translation, you can optionally provide a very brief (1-5 word) clarification or common English synonym in parentheses if it helps distinguish nuances. "
        f"Format each main translation on a new line. Start the line with the translated word/phrase. "
        f"Do not use markdown like asterisks for emphasis on the translated words themselves. "
        f"Avoid introductory sentences like 'Here are some options' or concluding sentences like 'Please provide context'. Just the list of translations. "
        f"Example for 'merely' to Ukrainian if the context implies 'only' or 'just':\n"
        f"лише (only, simply)\n"
        f"тільки (only, just)\n"
        f"Example for 'run' to Spanish:\n"
        f"correr (to move quickly on foot)\n"
        f"funcionar (to operate, for machines)\n"
        f"gestionar (to manage)"
    )
    print(f"Getting translation for \"{selected_text}\" to {target_language} with prompt.") # Removed long prompt from log
    translation_result = call_gemini_api(translation_prompt)
    if translation_result.startswith("Error:") or translation_result.startswith("Blocked by API:"):
        translation = f"Translation failed: {translation_result}"
    else:
        translation = translation_result
    
    return jsonify({
        'explanation': explanation,
        'translation': translation
    })

if __name__ == '__main__':
    if not GEMINI_API_KEY:
        print("CRITICAL ERROR: GEMINI_API_KEY not found in environment variables. Please set it in your .env file.")
    else:
        print(f"Using Gemini Model: {GEMINI_MODEL}")
        print(f"Attempting to run on http://127.0.0.1:5000")
        app.run(debug=True, host='0.0.0.0', port=5000)