import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import request = require('supertest');
import { EmailService } from '../src/email/email.service';
import { LeadsController } from '../src/leads/leads.controller';
import { LeadsService } from '../src/leads/leads.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('POST /api/leads — course modalities', () => {
  let app: INestApplication;
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'test-lead' });
  const lead = {
    name: 'Estudiante de prueba',
    email: 'student@example.com',
    phone: '+50688887777',
    country: 'cr',
  };

  beforeAll(async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const moduleRef = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [
        LeadsService,
        EmailService,
        {
          provide: ConfigService,
          useValue: { get: () => 'test-email-configuration' },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => sendMail.mockClear());

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['regular', 'Regular'],
    ['semi-intensive', 'Semi-intensiva'],
    ['intensive', 'Intensiva'],
    ['super-intensive', 'Súper intensiva'],
    ['private', 'Clases particulares'],
  ])('accepts %s and sends its readable name', async (course, name) => {
    const response = await request(app.getHttpServer())
      .post('/api/leads')
      .send({ ...lead, course })
      .expect(201);

    expect(response.body.data.emailSent).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const email = sendMail.mock.calls[0][0];
    expect(email.text).toContain(`Modalidade: ${name}`);
    expect(email.html).toContain(`<span class="value">${name}</span>`);
  });

  it.each(['business', 'travel', 'exam', 'accelerated', 'general'])(
    'keeps accepting legacy %s submissions from cached forms',
    async (course) => {
      await request(app.getHttpServer())
        .post('/api/leads')
        .send({ ...lead, course })
        .expect(201);

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].text).not.toContain('undefined');
      if (course === 'accelerated') {
        expect(sendMail.mock.calls[0][0].text).toContain('Modalidade: Curso Acelerado');
      }
    },
  );

  it.each(['unsupported-modality', '', undefined])(
    'rejects invalid or missing modality %s without sending email',
    async (course) => {
      await request(app.getHttpServer())
        .post('/api/leads')
        .send({ ...lead, course })
        .expect(400);

      expect(sendMail).not.toHaveBeenCalled();
    },
  );
});
