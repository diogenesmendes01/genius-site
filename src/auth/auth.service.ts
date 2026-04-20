import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from './user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Seed the first admin if the users table is empty. */
  async onModuleInit() {
    const count = await this.users.count();
    if (count > 0) return;

    const email =
      this.config.get<string>('ADMIN_EMAIL') ?? 'admin@geniusidiomas.com';
    const password = this.config.get<string>('ADMIN_PASSWORD');
    const name = this.config.get<string>('ADMIN_NAME') ?? 'Administrador';

    if (!password) {
      this.logger.warn(
        `No admin user exists and ADMIN_PASSWORD is not set — skipping seed. ` +
          `Set ADMIN_PASSWORD in .env and restart to create the first admin.`,
      );
      return;
    }

    const user = this.users.create({
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
      active: true,
    });
    await this.users.save(user);
    this.logger.log(`Seeded first admin: ${email}`);
  }

  async validate(email: string, password: string) {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user || !user.active) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    user.lastLoginAt = new Date();
    await this.users.save(user);
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validate(email, password);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const token = await this.jwt.signAsync(payload);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async findById(id: string) {
    return this.users.findOne({ where: { id } });
  }

  cookieMaxAgeMs() {
    const minutes = Number(this.config.get<string>('JWT_EXPIRES_MINUTES') ?? 480);
    return minutes * 60 * 1000;
  }
}
