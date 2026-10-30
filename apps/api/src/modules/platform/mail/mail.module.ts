import { Module, type OnModuleInit } from '@nestjs/common';

import { AppConfig } from '../../../common/config/config.js';
import { Jobs } from '../jobs/jobs.service.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { EmailSendJob, type EmailSendData } from './email-send.job.js';
import { EMAIL_SEND, Mail } from './mail.service.js';
import { MailTemplates } from './mail-templates.js';
import { MailTransport } from './mail-transport.js';
import { MailpitTransport } from './mailpit.transport.js';
import { ResendTransport } from './resend.transport.js';

// E-mail (ADR-007 · add-foundation-auth-access design D8): the transport chosen by MAIL_TRANSPORT,
// the templates, Mail.enqueue and the `email.send` handler, registered with the jobs service.
export function mailTransportFor(config: AppConfig): MailTransport {
  return config.env.MAIL_TRANSPORT === 'resend'
    ? new ResendTransport(config)
    : new MailpitTransport(config);
}

@Module({
  imports: [JobsModule],
  providers: [
    { provide: MailTransport, inject: [AppConfig], useFactory: mailTransportFor },
    MailTemplates,
    Mail,
    EmailSendJob,
  ],
  exports: [Mail],
})
export class MailModule implements OnModuleInit {
  constructor(
    private readonly jobs: Jobs,
    private readonly emailSend: EmailSendJob,
  ) {}

  onModuleInit(): void {
    this.jobs.register<EmailSendData>(EMAIL_SEND, (data) => this.emailSend.handle(data));
  }
}
