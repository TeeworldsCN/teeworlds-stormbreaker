import net from 'net';

interface EconOptions {
  host?: string;
  port: number;
  password: string;
  timeout?: number;
}

export class TeeworldsEcon {
  options: EconOptions;
  conn: net.Socket;
  state: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  error: string;
  timeout: NodeJS.Timeout;
  messageHooks: (msg: string) => void;
  closeHook: (hadError: boolean) => void;
  errorHook: (err: Error) => void;

  constructor(options: EconOptions) {
    this.options = options;
  }

  async connect() {
    if (!this.options.timeout) this.options.timeout = 10000;
    if (!this.options.host) this.options.host = 'localhost';

    this.state = 'connecting';
    this.conn = net.connect({ host: this.options.host, port: this.options.port });
    this.conn.on('close', hadError => this.closeHook?.(hadError));
    this.conn.on('error', err => this.errorHook?.(err));
    return new Promise<void>((resolve, reject) => {
      this.timeout = setTimeout(() => {
        if (this.state == 'connecting') {
          this.disconnect();
          reject(new Error('Connection timeout.'));
        }
      }, this.options.timeout);
      this.conn.on('data', data => {
        const line = data.toString('utf-8').trimEnd();
        if (this.state == 'connecting') {
          if (line.startsWith('Enter password:')) {
            this.conn.write(this.options.password + '\n');
          } else if (line.startsWith('Authentication successful.')) {
            this.state = 'connected';
            if (this.timeout) {
              clearTimeout(this.timeout);
              this.timeout = null;
            }
            resolve();
          } else if (line.startsWith('Wrong password.')) {
            reject(new Error('Wrong password.'));
          }
        } else {
          this.messageHooks?.(line);
        }
      });
    });
  }

  disconnect() {
    if (this.state != 'disconnected' || this.conn) {
      this.state = 'disconnected';
      this.conn.end();
      this.conn = null;
    }
  }

  async send(command: string | string[]) {
    if (this.state == 'connected') {
      let flushed = true;
      if (Array.isArray(command)) {
        flushed = this.conn.write(command.join('\n') + '\n');
      } else {
        flushed = this.conn.write(command + '\n');
      }
      if (!flushed) {
        return new Promise<void>(resolve => {
          this.conn.once('drain', () => {
            resolve();
          });
        });
      } else {
        return;
      }
    } else {
      throw new Error('Connection not established');
    }
  }

  on(event: 'message', listener: (msg: string) => void): this;
  on(event: 'close', listener: (hadError: boolean) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: string, listener: (...params: any[]) => void) {
    if (event == 'message') {
      this.messageHooks = listener;
    } else if (event == 'close') {
      this.closeHook = listener;
    } else if (event == 'error') {
      this.errorHook = listener;
    }
    return this;
  }

  static async quickfire(options: EconOptions, command: string | string[]): Promise<void>;
  static async quickfire(
    options: EconOptions,
    command: string | string[],
    collectResponsesFor: number
  ): Promise<string[]>;
  static async quickfire(
    options: EconOptions,
    command: string | string[],
    collectResponsesFor: number = 0
  ): Promise<void | string[]> {
    const econ = new TeeworldsEcon(options);
    await econ.connect();
    if (collectResponsesFor) {
      const responses: string[] = [];
      econ.on('message', msg => {
        responses.push(msg);
      });
      await econ.send(command);
      return new Promise(resolve => {
        setTimeout(() => {
          econ.disconnect();
          resolve(responses);
        }, collectResponsesFor);
      });
    } else {
      await econ.send(command);
      econ.disconnect();
      return;
    }
  }
}
