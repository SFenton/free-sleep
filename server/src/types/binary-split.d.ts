declare module 'binary-split' {
  import { Transform } from 'stream';

  export default function binarySplit(splitOn?: string | Buffer): Transform;
}
