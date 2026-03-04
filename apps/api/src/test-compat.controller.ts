import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { InputMap } from './common/request-utils';

@Controller('test')
export class TestCompatController {
  @Get('get')
  async testGet(@Query() query: InputMap, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header(
      'Set-Cookie',
      `_uid=12; Path=/; HttpOnly; Expires=${this.expireDate(7).toUTCString()}; SameSite=Lax`
    );
    return resReturn(query);
  }

  @Post('post')
  async testPost(@Body() body: InputMap) {
    return resReturn(body);
  }

  @Put('put')
  async testPut(@Body() body: InputMap) {
    return resReturn(body);
  }

  @Delete('delete')
  async testDelete(@Body() body: InputMap) {
    return resReturn(body);
  }

  @Head('head')
  async testHead(@Query() query: InputMap) {
    return resReturn(query);
  }

  @Options('options')
  async testOptions(@Query() query: InputMap) {
    return resReturn(query);
  }

  @Patch('patch')
  async testPatch(@Body() body: InputMap) {
    return resReturn(body);
  }

  @Post('files/upload')
  async testFilesUpload() {
    return resReturn({ res: '上传成功' });
  }

  @Post('single/upload')
  async testSingleUpload(@Req() _req: FastifyRequest) {
    return resReturn({ res: '上传成功' });
  }

  @Post('http/code')
  async testHttpCode(
    @Query() query: InputMap,
    @Body() body: InputMap,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const code = Number(query.code);
    reply.status(Number.isFinite(code) ? code : 200);
    return resReturn(body);
  }

  @Post('raw')
  async testRaw(@Body() body: InputMap) {
    return resReturn(body);
  }

  @Get('response')
  async testResponse(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    return { b: '12', c: '23' };
  }

  private expireDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
