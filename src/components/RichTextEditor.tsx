/**
 * 完整富文本编辑器 - 自定义工具栏的 Quill 编辑器
 * 适用场景：详细的内容编辑（选题详情、创作详情等）
 */
import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { 
  Bold, Italic, Underline, Strikethrough, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, 
  Undo, Redo,
  Minus, Plus,
  ChevronDown,
  MessageSquare,
  Printer,
  X,
  Trash2,
  Indent
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

interface Annotation {
  id: string;
  text: string;
  comment: string;
  createdAt: Date;
}

const textColors = [
  { color: '#000000', label: '黑色' },
  { color: '#e74c3c', label: '红色' },
  { color: '#3498db', label: '蓝色' },
  { color: '#2ecc71', label: '绿色' },
  { color: '#f39c12', label: '橙色' },
  { color: '#9b59b6', label: '紫色' },
];

const bgColors = [
  { color: 'transparent', label: '透明' },
  { color: '#fff3cd', label: '黄色高亮' },
  { color: '#d4edda', label: '绿色高亮' },
  { color: '#d1ecf1', label: '蓝色高亮' },
  { color: '#f8d7da', label: '粉色高亮' },
  { color: '#e2e3e5', label: '灰色高亮' },
];

const fontSizes = [
  { size: '12px', label: '小' },
  { size: '14px', label: '稍小' },
  { size: '16px', label: '正常' },
  { size: '18px', label: '稍大' },
  { size: '20px', label: '大' },
  { size: '24px', label: '特大' },
  { size: '28px', label: '超大' },
  { size: '32px', label: '巨大' },
];

const DEFAULT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const DEFAULT_FONT_SIZE = '16px';
const DEFAULT_COLOR = '#333333';

const normalizeHTML = (html: string): string => {
  if (!html || html === '<p><br></p>') {
    return html;
  }

  let result = html;

  // 1. 替换所有<font>标签
  result = result.replace(/<font\s+([^>]*)>([\s\S]*?)<\/font>/gi, (match, attrs, content) => {
    const styleParts: string[] = [];
    let id = '';
    let comment = '';

    if (attrs) {
      const colorMatch = attrs.match(/color=['"]?([^'" >]+)/i);
      if (colorMatch) {
        styleParts.push(`color: ${colorMatch[1]}`);
      }

      const faceMatch = attrs.match(/face=['"]?([^'" >]+)/i);
      if (faceMatch) {
        styleParts.push(`font-family: ${faceMatch[1]}`);
      }

      const sizeMatch = attrs.match(/size=['"]?([^'" >]+)/i);
      if (sizeMatch) {
        const size = sizeMatch[1];
        let fontSize = '';
        switch (size) {
          case '1': fontSize = '10px'; break;
          case '2': fontSize = '13px'; break;
          case '3': fontSize = '16px'; break;
          case '4': fontSize = '18px'; break;
          case '5': fontSize = '24px'; break;
          case '6': fontSize = '32px'; break;
          case '7': fontSize = '48px'; break;
          default: fontSize = `${parseInt(size) * 2 + 10}px`;
        }
        styleParts.push(`font-size: ${fontSize}`);
      }

      const styleMatch = attrs.match(/style=['"]?([^'"]*)['"]?/i);
      if (styleMatch) {
        styleParts.push(styleMatch[1]);
      }

      const idMatch = attrs.match(/data-annotation-id=['"]?([^'">]+)/i);
      if (idMatch) {
        id = idMatch[1];
      }

      const commentMatch = attrs.match(/data-comment=['"]?([^'">]+)/i);
      if (commentMatch) {
        comment = commentMatch[1];
      }
    }

    let spanAttrs: string[] = [];
    if (styleParts.length > 0) {
      spanAttrs.push(`style="${styleParts.join('; ')}"`);
    }
    if (id) {
      spanAttrs.push(`data-annotation-id="${id}"`);
    }
    if (comment) {
      spanAttrs.push(`data-comment="${comment}"`);
    }

    return `<span ${spanAttrs.join(' ')}>${content}</span>`;
  });

  result = result.replace(/<b>([\s\S]*?)<\/b>/gi, (match, content) => {
    return `<span style="font-weight: bold;">${content}</span>`;
  });
  result = result.replace(/<i>([\s\S]*?)<\/i>/gi, (match, content) => {
    return `<span style="font-style: italic;">${content}</span>`;
  });
  result = result.replace(/<u>([\s\S]*?)<\/u>/gi, (match, content) => {
    return `<span style="text-decoration: underline;">${content}</span>`;
  });
  result = result.replace(/<s>([\s\S]*?)<\/s>/gi, (match, content) => {
    return `<span style="text-decoration: line-through;">${content}</span>`;
  });
  result = result.replace(/<strike>([\s\S]*?)<\/strike>/gi, (match, content) => {
    return `<span style="text-decoration: line-through;">${content}</span>`;
  });

  result = result.replace(/<span\s+([^>]*)>([\s\S]*?)<\/span>/gi, (match, attrs, content) => {
    const styleParts: string[] = [];
    let annotationId = '';
    let annotationComment = '';
    let className = '';

    if (attrs) {
      const styleMatch = attrs.match(/style=['"]?([^'"]*)['"]?/i);
      if (styleMatch) {
        const rawStyle = styleMatch[1];
        const styleObj: Record<string, string> = {};
        rawStyle.split(';').forEach((part: string) => {
          const [key, value] = part.split(':').map((s: string) => s.trim());
          if (key && value) {
            styleObj[key.toLowerCase()] = value;
          }
        });
        if (styleObj['font-family']) {
          styleParts.push(`font-family: ${styleObj['font-family']}`);
        }
        if (styleObj['font-size']) {
          styleParts.push(`font-size: ${styleObj['font-size']}`);
        }
        if (styleObj['color']) {
          styleParts.push(`color: ${styleObj['color']}`);
        }
        if (styleObj['background'] || styleObj['background-color']) {
          styleParts.push(`background-color: ${styleObj['background'] || styleObj['background-color']}`);
        }
        if (styleObj['font-weight']) {
          styleParts.push(`font-weight: ${styleObj['font-weight']}`);
        }
        if (styleObj['font-style']) {
          styleParts.push(`font-style: ${styleObj['font-style']}`);
        }
        if (styleObj['text-decoration']) {
          styleParts.push(`text-decoration: ${styleObj['text-decoration']}`);
        }
        if (styleObj['padding']) {
          styleParts.push(`padding: ${styleObj['padding']}`);
        }
        if (styleObj['border-radius']) {
          styleParts.push(`border-radius: ${styleObj['border-radius']}`);
        }
        if (styleObj['border-bottom']) {
          styleParts.push(`border-bottom: ${styleObj['border-bottom']}`);
        }
        if (styleObj['cursor']) {
          styleParts.push(`cursor: ${styleObj['cursor']}`);
        }
      }

      const idMatch = attrs.match(/data-annotation-id=['"]?([^'">]+)/i);
      if (idMatch) {
        annotationId = idMatch[1];
      }

      const commentMatch = attrs.match(/data-comment=['"]?([^'">]+)/i);
      if (commentMatch) {
        annotationComment = commentMatch[1];
      }

      const classMatch = attrs.match(/class=['"]?([^'">]+)/i);
      if (classMatch) {
        className = classMatch[1];
      }
    }

    const finalAttrs: string[] = [];
    if (styleParts.length > 0) {
      finalAttrs.push(`style="${styleParts.join('; ')}"`);
    }
    if (className) {
      finalAttrs.push(`class="${className}"`);
    }
    if (annotationId) {
      finalAttrs.push(`data-annotation-id="${annotationId}"`);
    }
    if (annotationComment) {
      finalAttrs.push(`data-comment="${annotationComment}"`);
    }

    if (finalAttrs.length > 0) {
      return `<span ${finalAttrs.join(' ')}>${content}</span>`;
    }
    return content;
  });

  return result;
};

const ensureDefaultStyles = (html: string): string => {
  if (!html || html === '<p><br></p>') {
    return html;
  }

  let result = html;
  
  result = result.replace(/(<p[^>]*>)(.*?)(<\/p>)/gis, (match, open, content, close) => {
    return `${open}${content}${close}`;
  });

  return result;
};

export default function RichTextEditor({ value, onChange, readOnly = false, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedFontSize, setSelectedFontSize] = useState('16px');
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [annotationComment, setAnnotationComment] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(true);
  
  const appStore = useAppStore();
  const isDark = appStore.theme === 'dark';

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      const normalizedHTML = ensureDefaultStyles(normalizeHTML(value));
      editorRef.current.innerHTML = normalizedHTML || '<p><br></p>';
      parseAnnotationsFromHTML();
    }
  }, [value]);

  const parseAnnotationsFromHTML = () => {
    if (!editorRef.current) return;
    const annotationSpans = editorRef.current.querySelectorAll('.annotation-text');
    const parsedAnnotations: Annotation[] = [];
    
    annotationSpans.forEach((span) => {
      const id = span.getAttribute('data-annotation-id');
      const comment = span.getAttribute('data-comment');
      const text = span.textContent;
      
      if (id && comment && text) {
        parsedAnnotations.push({
          id,
          text,
          comment,
          createdAt: new Date()
        });
      }
    });
    
    setAnnotations(parsedAnnotations);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isColorButton = target.closest('.color-picker-button');
      const isColorPicker = target.closest('.color-picker-dropdown');
      const isFontSizeButton = target.closest('.font-size-button');
      const isFontSizePicker = target.closest('.font-size-dropdown');
      
      if (!isColorButton && !isColorPicker) {
        setShowTextColorPicker(false);
        setShowBgColorPicker(false);
      }
      if (!isFontSizeButton && !isFontSizePicker) {
        setShowFontSizePicker(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        removeHighlightSelected();
        return;
      }
      
      highlightSelectedSpans();
    };

    const removeHighlightSelected = () => {
      if (!editorRef.current) return;
      const highlightedSpans = editorRef.current.querySelectorAll('.highlight-selected');
      highlightedSpans.forEach(span => {
        span.classList.remove('highlight-selected');
      });
    };

    const highlightSelectedSpans = () => {
      if (!editorRef.current) return;
      
      removeHighlightSelected();
      
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const parentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
      
      if (!parentElement || !(parentElement instanceof HTMLElement)) return;
      
      const spansWithBgColor = parentElement.querySelectorAll('span[style*="background-color"]');
      spansWithBgColor.forEach(span => {
        const spanRect = span.getBoundingClientRect();
        const rangeRect = range.getBoundingClientRect();
        
        if (rectsIntersect(spanRect, rangeRect)) {
          span.classList.add('highlight-selected');
        }
      });
    };

    const rectsIntersect = (rect1: DOMRect, rect2: DOMRect) => {
      return !(
        rect1.right < rect2.left ||
        rect1.left > rect2.right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2.bottom
      );
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      removeHighlightSelected();
    };
  }, []);

  const handleInput = () => {
    if (!editorRef.current) return;
    let html = editorRef.current.innerHTML;
    html = ensureDefaultStyles(html);
    onChange(html);
  };

  /**
   * 对跨块级元素的选区应用样式
   * 核心思路：遍历选区覆盖的所有文本节点，逐个用 span 包裹
   */
  const applyStyleAcrossBlocks = (styleProperty: string, styleValue: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !editorRef.current) return;

    const range = selection.getRangeAt(0);

    // 收集选区内的所有文本节点
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let current: Text | null;
    while ((current = walker.nextNode() as Text | null)) {
      textNodes.push(current);
    }

    if (textNodes.length === 0) return;

    // 逐个文本节点包裹 span
    textNodes.forEach((textNode) => {
      let startOffset = 0;
      let endOffset = textNode.textContent?.length || 0;

      // 第一个节点：可能有起始偏移
      if (textNode === range.startContainer) {
        startOffset = range.startOffset;
      }
      // 最后一个节点：可能有结束偏移
      if (textNode === range.endContainer) {
        endOffset = range.endOffset;
      }

      // 全选的文本节点直接包裹
      if (startOffset === 0 && endOffset === (textNode.textContent?.length || 0)) {
        const parent = textNode.parentNode;
        // 如果已经在同类型 span 里，跳过或更新
        if (parent && parent instanceof HTMLElement && parent.tagName === 'SPAN') {
          (parent as HTMLElement).style[styleProperty as any] = styleValue;
        } else {
          const span = document.createElement('span');
          span.style[styleProperty as any] = styleValue;
          textNode.parentNode?.insertBefore(span, textNode);
          span.appendChild(textNode);
        }
      } else {
        // 部分选中：拆分文本节点
        const selectedText = textNode.splitText(startOffset);
        selectedText.splitText(endOffset - startOffset);
        const span = document.createElement('span');
        span.style[styleProperty as any] = styleValue;
        selectedText.parentNode?.insertBefore(span, selectedText);
        span.appendChild(selectedText);
      }
    });

    handleInput();
  };

  const applyStyleToSelection = (styleProperty: string, styleValue: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    
    // 先尝试简单情况（单节点内选区）
    try {
      const span = document.createElement('span');
      span.style[styleProperty as any] = styleValue;
      range.surroundContents(span);
      handleInput();
      return;
    } catch (e) {
      // surroundContents 失败（跨元素），走通用逻辑
      applyStyleAcrossBlocks(styleProperty, styleValue);
    }
  };

  const handleTextColor = (color: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    editorRef.current?.focus();
    
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.color = color;
    
    try {
      range.surroundContents(span);
    } catch {
      const fragment = range.cloneContents();
      span.appendChild(fragment);
      range.deleteContents();
      range.insertNode(span);
    }
    handleInput();
    setShowTextColorPicker(false);
  };

  const handleBgColor = (color: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    editorRef.current?.focus();
    
    const range = selection.getRangeAt(0);
    
    // 清除背景色
    if (color === 'transparent') {
      // 向上查找最近的带背景色的 span
      let node: Node | null = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      
      const bgSpan = (node as Element)?.closest?.('span[style*="background"]');
      if (bgSpan) {
        // 移除背景色相关样式
        (bgSpan as HTMLElement).style.backgroundColor = '';
        // 如果 span 没有任何内联样式了，直接展开它
        if (!(bgSpan as HTMLElement).getAttribute('style')?.trim()) {
          bgSpan.replaceWith(...bgSpan.childNodes);
        }
      }
      handleInput();
      setShowBgColorPicker(false);
      return;
    }
    
    applyStyleAcrossBlocks('backgroundColor', color);
    setShowBgColorPicker(false);
  };
  
  const getCharacterCount = () => {
    if (!editorRef.current) return { chinese: 0, english: 0, total: 0 };
    
    const text = editorRef.current.innerText || '';
    let chineseCount = 0;
    let englishCount = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (/[\u4e00-\u9fa5]/.test(char)) {
        chineseCount++;
      } else if (/[a-zA-Z]/.test(char)) {
        englishCount++;
      }
    }
    
    return {
      chinese: chineseCount,
      english: englishCount,
      total: text.length
    };
  };

  const handleFontSize = (size: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    if (editorRef.current) {
      editorRef.current.focus();
    }
    
    applyStyleAcrossBlocks('fontSize', size);
    setSelectedFontSize(size);
    setShowFontSizePicker(false);
  };

  const handleAddAnnotation = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      appStore.addNotification({ title: '提示', message: '请先选中要添加批注的文本', type: 'warning' });
      return;
    }
    
    const text = selection.toString();
    const range = selection.getRangeAt(0);
    
    setSelectedText(text);
    setSelectedRange(range.cloneRange());
    setAnnotationComment('');
    setShowAnnotationModal(true);
  };

  const handleSaveAnnotation = () => {
    if (!selectedRange || !editorRef.current) return;
    
    try {
      const annotationId = `annotation-${Date.now()}`;
      
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(selectedRange);
      }
      
      const span = document.createElement('span');
      span.className = 'annotation-text';
      span.setAttribute('data-annotation-id', annotationId);
      span.setAttribute('data-comment', annotationComment);
      span.style.backgroundColor = '#fef3c7';
      span.style.borderBottom = '2px solid #f59e0b';
      span.style.cursor = 'pointer';
      span.style.padding = '0 2px';
      span.style.borderRadius = '2px';
      
      selectedRange.surroundContents(span);
      
      const newAnnotation: Annotation = {
        id: annotationId,
        text: selectedText,
        comment: annotationComment,
        createdAt: new Date()
      };
      
      setAnnotations(prev => [...prev, newAnnotation]);
      handleInput();
      
      setShowAnnotationModal(false);
      setAnnotationComment('');
      setSelectedText('');
      setSelectedRange(null);
      
      appStore.addNotification({ title: '成功', message: '批注已添加', type: 'success' });
    } catch (e) {
      console.error('Error adding annotation:', e);
      appStore.addNotification({ title: '错误', message: '添加批注失败，请尝试选择较短的文本', type: 'error' });
    }
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    if (!editorRef.current) return;
    
    const annotationSpan = editorRef.current.querySelector(`[data-annotation-id="${annotationId}"]`);
    if (annotationSpan) {
      const parent = annotationSpan.parentNode;
      while (annotationSpan.firstChild) {
        parent?.insertBefore(annotationSpan.firstChild, annotationSpan);
      }
      parent?.removeChild(annotationSpan);
      handleInput();
    }
    
    setAnnotations(prev => prev.filter(a => a.id !== annotationId));
    setActiveAnnotationId(null);
  };

  const handleAnnotationClick = (annotationId: string) => {
    if (!editorRef.current) return;
    
    const annotationSpan = editorRef.current.querySelector(`[data-annotation-id="${annotationId}"]`);
    if (annotationSpan) {
      annotationSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
      annotationSpan.classList.add('annotation-highlight');
      setTimeout(() => {
        annotationSpan.classList.remove('annotation-highlight');
      }, 2000);
    }
    
    setActiveAnnotationId(annotationId);
  };

  const handlePrint = () => {
    if (!editorRef.current) return;
    
    const printContent = editorRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>打印剧本内容</title>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              line-height: 1.8;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
              color: #1a1a1a;
            }
            h1, h2, h3, h4, h5, h6 {
              margin-top: 1.5em;
              margin-bottom: 0.5em;
            }
            p {
              margin-bottom: 1em;
            }
            .annotation-text {
              background-color: #fef3c7;
              border-bottom: 2px solid #f59e0b;
              padding: 0 2px;
              position: relative;
              cursor: pointer;
            }
            .annotation-text::after {
              content: "【批注: " attr(data-comment) "】";
              display: inline;
              background-color: #fef3c7;
              color: #92400e;
              font-size: 12px;
              padding: 2px 6px;
              border-radius: 4px;
              margin-left: 4px;
              font-weight: normal;
              vertical-align: baseline;
              border: 1px solid #f59e0b;
              white-space: nowrap;
            }
            @media print {
              body {
                padding: 20px;
              }
              .annotation-text::before {
                font-size: 10px;
              }
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    const selection = window.getSelection();
    if (!selection) return;
    
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range) {
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('paste');
      handleInput();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          document.execCommand('undo');
          break;
        case 'y':
          e.preventDefault();
          document.execCommand('redo');
          break;
        case 'b':
          e.preventDefault();
          applyStyleToSelection('font-weight', 'bold');
          break;
        case 'i':
          e.preventDefault();
          applyStyleToSelection('font-style', 'italic');
          break;
        case 'u':
          e.preventDefault();
          applyStyleToSelection('text-decoration', 'underline');
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoom(prev => Math.min(prev + 10, 200));
          break;
        case '-':
          e.preventDefault();
          setZoom(prev => Math.max(prev - 10, 50));
          break;
      }
    }
  };

  const toolbarButtons = [
    { 
      icon: Undo, 
      action: () => { document.execCommand('undo'); }, 
      title: '撤销 (Ctrl+Z)' 
    },
    { 
      icon: Redo, 
      action: () => { document.execCommand('redo'); }, 
      title: '重做 (Ctrl+Y)' 
    },
    { divider: true },
    { 
      icon: Bold, 
      action: () => applyStyleToSelection('font-weight', 'bold'), 
      title: '加粗 (Ctrl+B)' 
    },
    { 
      icon: Italic, 
      action: () => applyStyleToSelection('font-style', 'italic'), 
      title: '斜体 (Ctrl+I)' 
    },
    { 
      icon: Underline, 
      action: () => applyStyleToSelection('text-decoration', 'underline'), 
      title: '下划线 (Ctrl+U)' 
    },
    { 
      icon: Strikethrough, 
      action: () => applyStyleToSelection('text-decoration', 'line-through'), 
      title: '删除线' 
    },
    { divider: true },
    { 
      icon: AlignLeft, 
      action: () => { document.execCommand('justifyLeft'); }, 
      title: '左对齐' 
    },
    { 
      icon: AlignCenter, 
      action: () => { document.execCommand('justifyCenter'); }, 
      title: '居中' 
    },
    { 
      icon: AlignRight, 
      action: () => { document.execCommand('justifyRight'); }, 
      title: '右对齐' 
    },
    { 
      icon: AlignJustify, 
      action: () => { document.execCommand('justifyFull'); }, 
      title: '两端对齐' 
    },
    { divider: true },
    { 
      icon: List, 
      action: () => { document.execCommand('insertUnorderedList'); }, 
      title: '无序列表' 
    },
    { 
      icon: ListOrdered, 
      action: () => { document.execCommand('insertOrderedList'); }, 
      title: '有序列表' 
    },
    { divider: true },
    { 
      icon: Indent, 
      action: () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
        const range = selection.getRangeAt(0);

        const BLOCK_TAGS = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];

        // 找出选区覆盖的所有块级元素
        const blocks = new Set<HTMLElement>();

        // 起始块
        let startBlock: Node | null = range.startContainer;
        if (startBlock.nodeType === Node.TEXT_NODE) startBlock = startBlock.parentNode;
        while (startBlock && startBlock !== editorRef.current) {
          if (BLOCK_TAGS.includes((startBlock as HTMLElement).tagName)) { blocks.add(startBlock as HTMLElement); break; }
          startBlock = startBlock.parentNode;
        }

        // 结束块
        let endBlock: Node | null = range.endContainer;
        if (endBlock.nodeType === Node.TEXT_NODE) endBlock = endBlock.parentNode;
        while (endBlock && endBlock !== editorRef.current) {
          if (BLOCK_TAGS.includes((endBlock as HTMLElement).tagName)) { blocks.add(endBlock as HTMLElement); break; }
          endBlock = endBlock.parentNode;
        }

        // 如果起止块之间还有其他块，也收集进来
        if (startBlock && startBlock !== endBlock) {
          let sibling = startBlock.nextSibling;
          while (sibling && sibling !== endBlock) {
            if (sibling instanceof HTMLElement && BLOCK_TAGS.includes(sibling.tagName)) {
              blocks.add(sibling);
            }
            sibling = sibling.nextSibling;
          }
        }

        // 如果选区覆盖了编辑器内所有块级元素，用 TreeWalker 兜底
        if (blocks.size <= 1 && range.toString().length > 0) {
          const walker = document.createTreeWalker(
            editorRef.current,
            NodeFilter.SHOW_ELEMENT,
            {
              acceptNode: (node) => {
                if (!BLOCK_TAGS.includes((node as HTMLElement).tagName)) return NodeFilter.FILTER_SKIP;
                if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );
          let el: Element | null;
          while ((el = walker.nextNode() as Element | null)) {
            blocks.add(el as HTMLElement);
          }
        }

        if (blocks.size === 0) return;

        // 判断操作：如果所有块都已缩进，则全部取消；否则全部加上
        const allIndented = Array.from(blocks).every(el => (parseInt(el.style.textIndent) || 0) > 0);
        blocks.forEach(el => {
          el.style.textIndent = allIndented ? '' : '2em';
        });

        handleInput();
      }, 
      title: '首行缩进' 
    },
  ];

  return (
    <div className="flex gap-4">
      <div className={`flex-1 rounded-xl border flex flex-col ${
        isDark 
          ? 'bg-gray-800 border-gray-700 shadow-lg shadow-black/20' 
          : 'bg-white border-gray-200 shadow-md'
      }`} style={{ height: 'calc(100vh - 180px)', minHeight: '500px' }}>
        <div className={`shrink-0 flex items-center justify-between px-4 py-2 border-b ${
          isDark ? 'border-gray-700 bg-gray-800' 
          : 'border-gray-200 bg-white'
        }`}>
          <div className="flex items-center gap-1">
            {toolbarButtons.map((btn, index) => {
              if (btn.divider) {
                return (
                  <div key={index} className={`w-px h-6 mx-2 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
                );
              }
              const Icon = btn.icon;
              if (!Icon) return null;
              return (
                <button
                  key={index}
                  onClick={btn.action}
                  className={`p-2 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
                  title={btn.title}
                >
                  <Icon className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                </button>
              );
            })}

            <div className={`w-px h-6 mx-2 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
            
            <div className="relative mr-1 font-size-button">
              <button
                onClick={() => {
                  setShowFontSizePicker(!showFontSizePicker);
                  setShowTextColorPicker(false);
                  setShowBgColorPicker(false);
                }}
                className={`p-2 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors flex items-center gap-1 min-w-[80px] h-[28px] justify-center`}
                title="字体大小"
              >
                <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{selectedFontSize}</span>
                <ChevronDown className={`w-3 h-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              </button>
              {showFontSizePicker && (
                <div className="font-size-dropdown absolute top-full left-0 mt-1 p-2 rounded-lg shadow-lg bg-white border border-gray-200 z-50 min-w-[100px]">
                  <div className="flex flex-col gap-1">
                    {fontSizes.map((item) => (
                      <button
                        key={item.size}
                        onClick={() => handleFontSize(item.size)}
                        className={`px-3 py-2 rounded hover:bg-gray-100 text-left flex items-center justify-between ${selectedFontSize === item.size ? 'bg-blue-50 text-blue-600' : ''}`}
                        style={{ fontSize: item.size }}
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={`w-px h-6 mx-2 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />

            <div className="relative mr-1 color-picker-button">
              <button
                onClick={() => {
                  setShowTextColorPicker(!showTextColorPicker);
                  setShowBgColorPicker(false);
                }}
                className={`p-2 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors relative min-w-[36px] h-[28px] flex items-center justify-center`}
                title="文字颜色"
              >
                <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>A</span>
                <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-red-500 border border-white shadow-sm"></span>
              </button>
              {showTextColorPicker && (
                <div className="color-picker-dropdown absolute top-full left-0 mt-1 p-2 rounded-lg shadow-lg bg-white border border-gray-200 z-50 min-w-[140px]">
                  <div className="grid grid-cols-3 gap-2">
                    {textColors.map((item) => (
                      <button
                        key={item.color}
                        onClick={() => handleTextColor(item.color)}
                        className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                        style={{ backgroundColor: item.color }}
                        title={item.label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative color-picker-button">
              <button
                onClick={() => {
                  setShowBgColorPicker(!showBgColorPicker);
                  setShowTextColorPicker(false);
                }}
                className={`p-2 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors relative min-w-[36px] h-[28px] flex items-center justify-center`}
                title="背景颜色"
              >
                <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>A</span>
                <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-yellow-300 border border-white shadow-sm"></span>
              </button>
              {showBgColorPicker && (
                <div className="color-picker-dropdown absolute top-full left-0 mt-1 p-2 rounded-lg shadow-lg bg-white border border-gray-200 z-50 min-w-[140px]">
                  <div className="grid grid-cols-3 gap-2">
                    {bgColors.map((item) => (
                      <button
                        key={item.color}
                        onClick={() => handleBgColor(item.color)}
                        className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                        style={{ backgroundColor: item.color }}
                        title={item.label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={`w-px h-6 mx-2 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />

            <button
              onClick={handleAddAnnotation}
              className={`p-2 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
              title="添加批注"
            >
              <MessageSquare className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>

            <button
              onClick={handlePrint}
              className={`p-2 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
              title="打印"
            >
              <Printer className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom(prev => Math.max(prev - 10, 50))}
                className={`p-1.5 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
                title="缩小"
              >
                <Minus className={`w-3.5 h-3.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
              </button>
              <span className={`text-sm font-medium min-w-[48px] text-center ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{zoom}%</span>
              <button
                onClick={() => setZoom(prev => Math.min(prev + 10, 200))}
                className={`p-1.5 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
                title="放大"
              >
                <Plus className={`w-3.5 h-3.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>

        <div 
          ref={editorRef}
          contentEditable={!readOnly}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onDrop={handleDrop}
          data-placeholder={placeholder || ''}
          className={`
            flex-1 overflow-y-auto w-full p-6
            ${isDark ? 'bg-gray-800' : 'bg-white'}
            ${isDark ? 'text-gray-100' : 'text-gray-900'}
            outline-none
            cursor-text
            rich-text-editor
            empty:before:content-[attr(data-placeholder)]
            ${isDark ? 'empty:before:text-gray-500' : 'empty:before:text-gray-400'}
            empty:before:pointer-events-none
          `}
          style={{ 
            lineHeight: 1.8,
            fontFamily: DEFAULT_FONT_FAMILY,
            fontSize: DEFAULT_FONT_SIZE,
            WebkitTapHighlightColor: 'transparent',
            zoom: `${zoom}%`
          }}
          suppressContentEditableWarning
        />
        
        <div className={`shrink-0 px-4 py-2 border-t ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                中文字数: <span className={isDark ? 'text-gray-200 font-medium' : 'text-gray-700 font-medium'}>{getCharacterCount().chinese}</span>
              </span>
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                英文字母: <span className={isDark ? 'text-gray-200 font-medium' : 'text-gray-700 font-medium'}>{getCharacterCount().english}</span>
              </span>
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                总字符数: <span className={isDark ? 'text-gray-200 font-medium' : 'text-gray-700 font-medium'}>{getCharacterCount().total}</span>
              </span>
            </div>
            <div className={isDark ? 'text-gray-500' : 'text-gray-400'}>
              批注数: {annotations.length}
            </div>
          </div>
        </div>
      </div>

      {annotations.length > 0 && showAnnotationPanel && (
        <div className={`w-72 flex-shrink-0 rounded-xl border overflow-hidden ${
          isDark 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-200'
        }`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            isDark ? 'border-gray-700 bg-amber-500/10' : 'border-gray-200 bg-amber-50'
          }`}>
            <h3 className={`font-semibold flex items-center gap-2 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              <MessageSquare className="w-4 h-4" />
              批注 ({annotations.length})
            </h3>
            <button
              onClick={() => setShowAnnotationPanel(false)}
              className={`p-1 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
            >
              <X className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            </button>
          </div>
          
          <div className="max-h-[500px] overflow-y-auto">
            {annotations.map((annotation) => (
              <div
                key={annotation.id}
                onClick={() => handleAnnotationClick(annotation.id)}
                className={`p-4 border-b cursor-pointer transition-colors ${
                  isDark ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-100 hover:bg-gray-50'
                } ${activeAnnotationId === annotation.id ? (isDark ? 'bg-amber-500/10' : 'bg-amber-50') : ''}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                  }`}>
                    批注
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAnnotation(annotation.id);
                    }}
                    className={`p-1 rounded hover:${isDark ? 'bg-red-500/20' : 'bg-red-100'} transition-colors`}
                    title="删除批注"
                  >
                    <Trash2 className={`w-3 h-3 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
                  </button>
                </div>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>"{annotation.text}"</p>
                <p className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'} font-medium`}>{annotation.comment}</p>
                <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{annotation.createdAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {annotations.length > 0 && !showAnnotationPanel && (
        <button
          onClick={() => setShowAnnotationPanel(true)}
          className={`fixed right-4 top-1/2 -translate-y-1/2 p-3 rounded-lg shadow-lg ${
            isDark 
              ? 'bg-gray-800 border border-gray-700 hover:bg-gray-700' 
              : 'bg-white border border-gray-200 hover:bg-gray-50'
          } transition-colors`}
          title="显示批注面板"
        >
          <MessageSquare className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center ${isDark ? 'bg-amber-500 text-white' : 'bg-amber-500 text-white'}`}>{annotations.length}</span>
        </button>
      )}

      {showAnnotationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl p-6 w-full max-w-md mx-4 ${isDark ? 'border border-gray-700' : 'border border-gray-200'}`}>
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2 flex items-center gap-2`}>
              <MessageSquare className="w-5 h-5 text-amber-500" />
              添加批注
            </h3>
            <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              选中文本: <span className={`font-medium ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>"{selectedText}"</span>
            </p>
            <textarea
              value={annotationComment}
              onChange={(e) => setAnnotationComment(e.target.value)}
              placeholder="请输入批注内容..."
              className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none`}
              rows={4}
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowAnnotationModal(false);
                  setAnnotationComment('');
                  setSelectedText('');
                  setSelectedRange(null);
                }}
                className={`flex-1 px-4 py-2 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded-lg transition-colors`}
              >
                取消
              </button>
              <button
                onClick={handleSaveAnnotation}
                disabled={!annotationComment.trim()}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .annotation-text {
          position: relative;
          transition: all 0.2s;
        }
        .annotation-text:hover {
          background-color: #fde68a !important;
        }
        .annotation-highlight {
          animation: highlight-pulse 2s ease-in-out;
        }
        @keyframes highlight-pulse {
          0%, 100% { background-color: #fef3c7; }
          50% { background-color: #fde047; }
        }
      `}</style>
    </div>
  );
}
