'use strict';

function normalizeHeading(line) {
  const heading = /^ {0,3}(#{2,3})([ \t].*|$)/.exec(line);
  if (!heading) return line;
  const [, marker, content] = heading;
  return `${marker} ${content.replace(/[ \t]+#+[ \t]*$/, '').trim()}`;
}

function reportLines(text) {
  const lines = text.split(/\r\n?|\n/);
  const visible = [];
  let fence;
  let comment = false;
  const structural = lines.map((line) => {
    if (!fence && (comment || /^ {0,3}<!--/.test(line))) {
      comment = !line.includes('-->');
      visible.push('');
      return '';
    }
    visible.push(line);
    if (!fence && /^(?: {4}| {0,3}\t)/.test(line)) return '';
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!fence) {
      if (!match || (match[1][0] === '`' && match[2].includes('`'))) return normalizeHeading(line);
      fence = match[1];
    } else if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) {
      fence = undefined;
    }
    return '';
  });
  return { visible, structural };
}

function bulletDetails(detail, lines, start, end) {
  const inline = detail.replace(/<!--.*?-->/g, '').replace(/^\s*:/, '').trim();
  if (inline) return inline;
  for (let i = start + 1; i < end; i++) {
    if (lines[i].trim()) return /^(?: {2}|\t)/.test(lines[i]) ? lines[i].trim() : '';
  }
  return '';
}

module.exports = { reportLines, bulletDetails };
