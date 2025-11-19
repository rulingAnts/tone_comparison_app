/**
 * UTF-16 XML Handler for Dekereke Format
 * Properly handles UTF-16 encoding and preserves exact XML structure
 */

class XMLHandler {
  constructor() {
    this.encoding = 'UTF-16'; // Default to UTF-16 for Dekereke files
  }

  /**
   * Parse XML string to JSON, handling UTF-16
   */
  async parseFromString(xmlString) {
    try {
      // Detect encoding from XML declaration
      const encodingMatch = xmlString.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
      this.encoding = encodingMatch ? encodingMatch[1] : 'UTF-16';
      
      console.log(`[XMLHandler] Detected encoding: ${this.encoding}`);

      // If it's a Uint8Array/ArrayBuffer, convert properly
      if (xmlString instanceof ArrayBuffer || xmlString instanceof Uint8Array) {
        xmlString = this.decodeXML(xmlString);
      }

      // Parse with DOMParser (handles UTF-8)
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

      // Check for parser errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error('XML parsing failed: ' + parserError.textContent);
      }

      // Convert to JSON structure
      const result = this.xmlNodeToJson(xmlDoc.documentElement);
      
      // Preserve XML declaration info
      result._xmlDeclaration = {
        version: '1.0',
        encoding: this.encoding
      };

      return result;
    } catch (error) {
      console.error('[XMLHandler] Parse error:', error);
      throw error;
    }
  }

  /**
   * Decode XML from binary data with proper encoding
   */
  decodeXML(buffer) {
    // Convert to Uint8Array if needed
    const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    
    // Check for UTF-16 BOM (Byte Order Mark)
    if (uint8Array.length >= 2) {
      // UTF-16 LE BOM: FF FE
      if (uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
        console.log('[XMLHandler] Detected UTF-16 LE BOM');
        return this.decodeUTF16LE(uint8Array.slice(2));
      }
      // UTF-16 BE BOM: FE FF
      if (uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
        console.log('[XMLHandler] Detected UTF-16 BE BOM');
        return this.decodeUTF16BE(uint8Array.slice(2));
      }
    }
    
    // Try UTF-8 (default for most browsers)
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(uint8Array);
      if (text.includes('<?xml')) {
        console.log('[XMLHandler] Using UTF-8 decoding');
        return text;
      }
    } catch (e) {
      // UTF-8 failed
    }

    // Fallback: Try UTF-16 LE without BOM
    console.log('[XMLHandler] Attempting UTF-16 LE without BOM');
    return this.decodeUTF16LE(uint8Array);
  }

  /**
   * Decode UTF-16 Little Endian
   */
  decodeUTF16LE(uint8Array) {
    try {
      const decoder = new TextDecoder('utf-16le');
      return decoder.decode(uint8Array);
    } catch (e) {
      console.error('[XMLHandler] UTF-16 LE decode failed:', e);
      // Manual decode as fallback
      return this.manualDecodeUTF16LE(uint8Array);
    }
  }

  /**
   * Decode UTF-16 Big Endian
   */
  decodeUTF16BE(uint8Array) {
    try {
      const decoder = new TextDecoder('utf-16be');
      return decoder.decode(uint8Array);
    } catch (e) {
      console.error('[XMLHandler] UTF-16 BE decode failed:', e);
      return this.manualDecodeUTF16BE(uint8Array);
    }
  }

  /**
   * Manual UTF-16 LE decoder (fallback)
   */
  manualDecodeUTF16LE(uint8Array) {
    let result = '';
    for (let i = 0; i < uint8Array.length; i += 2) {
      if (i + 1 < uint8Array.length) {
        const charCode = uint8Array[i] | (uint8Array[i + 1] << 8);
        result += String.fromCharCode(charCode);
      }
    }
    return result;
  }

  /**
   * Manual UTF-16 BE decoder (fallback)
   */
  manualDecodeUTF16BE(uint8Array) {
    let result = '';
    for (let i = 0; i < uint8Array.length; i += 2) {
      if (i + 1 < uint8Array.length) {
        const charCode = (uint8Array[i] << 8) | uint8Array[i + 1];
        result += String.fromCharCode(charCode);
      }
    }
    return result;
  }

  /**
   * Convert XML DOM node to JSON, preserving structure
   */
  xmlNodeToJson(node) {
    const obj = {};

    // Handle attributes
    if (node.attributes && node.attributes.length > 0) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        obj[attr.nodeName] = attr.nodeValue;
      }
    }

    // Track child element names for array detection
    const childElements = {};
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === 1) { // Element node
        childElements[child.nodeName] = (childElements[child.nodeName] || 0) + 1;
      }
    }

    // Process children
    let hasElementChildren = false;
    let textContent = '';
    
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];

      if (child.nodeType === 1) { // Element node
        hasElementChildren = true;
        const childName = child.nodeName;
        const childObj = this.xmlNodeToJson(child);

        // If multiple elements with same name, create array
        if (childElements[childName] > 1) {
          if (!obj[childName]) {
            obj[childName] = [];
          }
          obj[childName].push(childObj);
        } else {
          obj[childName] = childObj;
        }
      } else if (child.nodeType === 3) { // Text node
        const text = child.nodeValue.trim();
        if (text) {
          textContent += text;
        }
      }
    }

    // If only text content and no element children, return the text
    if (!hasElementChildren && textContent && Object.keys(obj).length === 0) {
      return textContent;
    }

    // If text content with attributes, add as #text
    if (textContent && Object.keys(obj).length > 0) {
      obj['#text'] = textContent;
    }

    return Object.keys(obj).length === 0 ? '' : obj;
  }

  /**
   * Build XML string from JSON, preserving UTF-16 encoding
   */
  buildXMLString(obj, rootName = null) {
    let xml = '';
    
    // Add XML declaration if present
    if (obj._xmlDeclaration) {
      const { version, encoding } = obj._xmlDeclaration;
      xml += `<?xml version="${version}" encoding="${encoding}"?>\n`;
      
      // Remove declaration from object
      const cleanObj = { ...obj };
      delete cleanObj._xmlDeclaration;
      obj = cleanObj;
    } else {
      // Default to UTF-16
      xml += `<?xml version="1.0" encoding="UTF-16"?>\n`;
    }

    // Build XML body
    if (rootName) {
      xml += this.jsonToXmlNode(obj, rootName);
    } else {
      // Use first key as root
      const firstKey = Object.keys(obj)[0];
      xml += this.jsonToXmlNode(obj[firstKey], firstKey);
    }

    return xml;
  }

  /**
   * Convert JSON to XML node
   */
  jsonToXmlNode(obj, nodeName, indent = '') {
    if (obj === null || obj === undefined) {
      return `${indent}<${nodeName}/>\n`;
    }

    // Simple string value
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return `${indent}<${nodeName}>${this.escapeXML(String(obj))}</${nodeName}>\n`;
    }

    // Array - multiple elements with same name
    if (Array.isArray(obj)) {
      let xml = '';
      for (const item of obj) {
        xml += this.jsonToXmlNode(item, nodeName, indent);
      }
      return xml;
    }

    // Object - separate attributes from children
    const attributes = {};
    const children = {};
    let textContent = null;

    for (const key in obj) {
      if (key === '#text') {
        textContent = obj[key];
      } else if (key.startsWith('@') || this.isAttribute(key)) {
        attributes[key.replace('@', '')] = obj[key];
      } else {
        children[key] = obj[key];
      }
    }

    let xml = `${indent}<${nodeName}`;

    // Add attributes
    for (const attr in attributes) {
      xml += ` ${attr}="${this.escapeXML(attributes[attr])}"`;
    }

    // Check for children or text content
    const hasChildren = Object.keys(children).length > 0;
    
    if (!hasChildren && !textContent) {
      return xml + '/>\n';
    }

    xml += '>';

    // Add text content if present
    if (textContent && !hasChildren) {
      xml += this.escapeXML(textContent);
      xml += `</${nodeName}>\n`;
      return xml;
    }

    // Add children
    if (hasChildren) {
      xml += '\n';
      for (const key in children) {
        xml += this.jsonToXmlNode(children[key], key, indent + '  ');
      }
      xml += `${indent}</${nodeName}>\n`;
    } else {
      xml += `</${nodeName}>\n`;
    }

    return xml;
  }

  /**
   * Check if a key should be treated as an attribute
   */
  isAttribute(key) {
    // Common attribute names that don't start with @
    const commonAttrs = ['id', 'name', 'type', 'value', 'ref', 'Reference', 'Homograph'];
    return commonAttrs.includes(key);
  }

  /**
   * Escape XML special characters
   */
  escapeXML(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Encode string to UTF-16 ArrayBuffer for saving
   */
  encodeToUTF16(xmlString) {
    // Add BOM for UTF-16 LE
    const length = xmlString.length;
    const buffer = new ArrayBuffer((length * 2) + 2); // +2 for BOM
    const view = new Uint8Array(buffer);
    
    // Write BOM
    view[0] = 0xFF;
    view[1] = 0xFE;
    
    // Write UTF-16 LE encoded string
    for (let i = 0; i < length; i++) {
      const charCode = xmlString.charCodeAt(i);
      view[(i * 2) + 2] = charCode & 0xFF; // Low byte
      view[(i * 2) + 3] = (charCode >> 8) & 0xFF; // High byte
    }
    
    return buffer;
  }
}

// Make available globally
window.XMLHandler = XMLHandler;
console.log('[XMLHandler] UTF-16 capable XML handler loaded');
