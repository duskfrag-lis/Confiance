// passport-microsoft no publica tipos; solo se declara lo que usa MicrosoftStrategy.
declare module 'passport-microsoft' {
  import { Strategy as OAuth2Strategy, StrategyOptions } from 'passport-oauth2';

  export interface MicrosoftStrategyOptions extends Omit<StrategyOptions, 'authorizationURL' | 'tokenURL'> {
    tenant?: string;
    addUPNAsEmail?: boolean;
  }

  export class Strategy extends OAuth2Strategy {
    constructor(options: MicrosoftStrategyOptions, verify: (...args: any[]) => void);
  }
}