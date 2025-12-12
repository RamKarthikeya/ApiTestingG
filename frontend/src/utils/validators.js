/**
 * Safely parses a JSON string from user input.
 * * @param {string} jsonString - The raw string from the textarea
 * @param {string} fieldLabel - The name of the field (e.g., "Headers") for error messages
 * @returns {object} The parsed JSON object
 * @throws {Error} If parsing fails, with a user-friendly message
 */
export const parseJsonInput = (jsonString, fieldLabel) => {
  if (!jsonString || typeof jsonString !== 'string' || jsonString.trim() === '') {
    return {};
  }
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    // We can try to give a hint about where the error is, 
    // but usually a general message is safer for UI
    throw new Error(`Invalid JSON syntax in ${fieldLabel}. Please check for missing quotes ("), commas (,), or matching braces ({ }).`);
  }
};

/**
 * Checks if a string is a valid HTTP or HTTPS URL.
 * Used for validating the "Target URL" input before running tests.
 * * @param {string} string - The URL to test
 * @returns {boolean}
 */
export const isValidUrl = (string) => {
  if (!string) return false;
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
};