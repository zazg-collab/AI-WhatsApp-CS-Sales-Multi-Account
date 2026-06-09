import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from './current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({ summary: 'Login with email and password' })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiOperation({ summary: 'Logout (client discards JWT)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout() {
    // Stateless JWT — client discards token. Endpoint kept for audit hook.
    return { success: true };
  }

  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
