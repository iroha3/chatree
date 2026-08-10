import { FileExtractResult } from '../types';

export async function extractTextFromFiles(files: File[]): Promise<FileExtractResult[]> {
  const results: FileExtractResult[] = [];
  
  for (const file of files) {
    try {
      let text = '';
      
      if (file.type !== 'text/plain' && file.type !== 'text/markdown') {
        throw new Error(`Unsupported file type: ${file.type}`);
      }

      text = await extractTextFromTextFile(file);
      
      results.push({
        text,
        filename: file.name,
        mimeType: file.type
      });
    } catch (error) {
      console.error(`Error extracting text from ${file.name}:`, error);
      results.push({
        text: `[Error extracting text: ${error instanceof Error ? error.message : 'Unknown error'}]`,
        filename: file.name,
        mimeType: file.type
      });
    }
  }
  
  return results;
}

async function extractTextFromTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string || '');
    };
    reader.onerror = () => {
      reject(new Error('Failed to read text file'));
    };
    reader.readAsText(file);
  });
}
