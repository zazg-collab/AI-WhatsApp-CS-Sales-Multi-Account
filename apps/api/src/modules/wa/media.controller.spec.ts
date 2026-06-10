import { NotFoundException } from '@nestjs/common';
import { MediaController } from './media.controller';

describe('MediaController', () => {
  let controller: MediaController;
  let storage: { read: jest.Mock };
  let res: any;

  const VALID = '01234567-89ab-4cde-8f01-23456789abcd.jpg';

  beforeEach(() => {
    storage = { read: jest.fn().mockResolvedValue(Buffer.from('x')) };
    controller = new MediaController(storage as any);
    res = { setHeader: jest.fn(), send: jest.fn() };
  });

  it('serves a file with the right content type', async () => {
    await controller.serve(VALID, res);
    expect(storage.read).toHaveBeenCalledWith(VALID);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('x'));
  });

  it('forces download for unknown extensions', async () => {
    const binName = '01234567-89ab-4cde-8f01-23456789abcd.bin';
    await controller.serve(binName, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment'),
    );
  });

  it('propagates 404 when the storage layer cannot find the key', async () => {
    storage.read.mockRejectedValue(new NotFoundException());
    await expect(controller.serve(VALID, res)).rejects.toThrow(NotFoundException);
  });

  it('rejects path traversal and non-uuid names without touching storage', async () => {
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
    expect(storage.read).not.toHaveBeenCalled();
  });
});
