import { NotFoundException } from '@nestjs/common';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MediaController } from './media.controller';

describe('MediaController', () => {
  let controller: MediaController;
  let mediaDir: string;
  let res: any;

  const VALID = '01234567-89ab-4cde-8f01-23456789abcd.jpg';

  beforeEach(async () => {
    mediaDir = await mkdtemp(join(tmpdir(), 'wa-media-'));
    controller = new MediaController({ get: () => mediaDir } as any);
    res = { setHeader: jest.fn(), sendFile: jest.fn() };
  });

  it('serves an existing file with the right content type', async () => {
    await writeFile(join(mediaDir, VALID), Buffer.from('x'));
    await controller.serve(VALID, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.sendFile).toHaveBeenCalledWith(join(mediaDir, VALID));
  });

  it('forces download for unknown extensions', async () => {
    const binName = '01234567-89ab-4cde-8f01-23456789abcd.bin';
    await writeFile(join(mediaDir, binName), Buffer.from('x'));
    await controller.serve(binName, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment'),
    );
  });

  it('404s when the file does not exist', async () => {
    await expect(controller.serve(VALID, res)).rejects.toThrow(NotFoundException);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('rejects path traversal and non-uuid names without touching the fs', async () => {
    for (const name of [
      '../../etc/passwd',
      '..%2f..%2fetc%2fpasswd',
      'creds.json',
      '01234567-89ab-4cde-8f01-23456789abcd', // no extension
      '01234567-89ab-4cde-8f01-23456789abcd.veryverylongext',
      'UPPERCASE-89AB-4CDE-8F01-23456789ABCD.jpg',
    ]) {
      await expect(controller.serve(name, res)).rejects.toThrow(NotFoundException);
    }
    expect(res.sendFile).not.toHaveBeenCalled();
  });
});
