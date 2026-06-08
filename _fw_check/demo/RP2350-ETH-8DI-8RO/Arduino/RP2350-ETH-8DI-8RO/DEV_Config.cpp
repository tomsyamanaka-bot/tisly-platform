/*****************************************************************************
* | File      	:   DEV_Config.c
* | Author      :   Waveshare team
* | Function    :   Hardware interface
* | Date        :   2019-07-31
* | Info        :   
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documnetation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of theex Software, and to permit persons to  whom the Software is
# furished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS OR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
******************************************************************************/
#include "DEV_Config.h"

uint slice_num;
uint8_t relay_status[8] = {0}; 
void gpio_irq_handler(uint gpio, uint32_t events);

/**
 * GPIO read and write
**/
void DEV_Digital_Write(uint16_t Pin, uint8_t Value)
{
    gpio_put(Pin, Value);
}

uint8_t DEV_Digital_Read(uint16_t Pin)
{
    return gpio_get(Pin);
}

/**
 * SPI
 **/
void DEV_SPI_WriteByte(uint8_t Value)
{
    SPI1.transfer(Value);
}

void DEV_SPI_Write_nByte(uint8_t pData[], uint32_t Len)
{
     SPI1.transfer(pData, Len);
}

/**
 * I2C
**/
void DEV_I2C_Write_Byte(uint8_t addr, uint8_t reg, uint8_t Value)
{
    Wire1.beginTransmission(addr);
    Wire1.write(reg);
    Wire1.write(Value);
    Wire1.endTransmission();
}

void DEV_I2C_Write_nByte(uint8_t addr,uint8_t *pData, uint32_t Len)
{
    Wire1.beginTransmission(addr);
    Wire1.write(pData,Len);
    Wire1.endTransmission();
}

uint8_t DEV_I2C_Read_Byte(uint8_t addr, uint8_t reg)
{
    uint8_t value;
  
    Wire1.beginTransmission(addr);
    Wire1.write((byte)reg);
    Wire1.endTransmission();
  
    Wire1.requestFrom(addr, (byte)1);
    value = Wire1.read();
  
    return value;
}

void DEV_I2C_Read_Register(uint8_t addr, uint8_t reg, uint16_t *value)
{
    uint8_t tmpi[2];
    
    Wire1.beginTransmission(addr);
    Wire1.write(reg);
    // Wire1.endTransmission();
    Wire1.requestFrom(addr, 2);
  
    uint8_t i = 0;
    for(i = 0; i < 2; i++) {
      tmpi[i] =  Wire1.read();
    }
    Wire1.endTransmission();
    *value = (((uint16_t)tmpi[0] << 8) | (uint16_t)tmpi[1]);
}

void DEV_I2C_Read_nByte(uint8_t addr, uint8_t reg, uint8_t *pData, uint32_t Len)
{
    Wire1.beginTransmission(addr);
    Wire1.write(reg);
    Wire1.endTransmission();
    
    Wire1.requestFrom(addr, Len);
  
    uint8_t i = 0;
    for(i = 0; i < Len; i++) {
      pData[i] =  Wire1.read();
    }
    Wire1.endTransmission();
}

/**
 * GPIO Mode
**/
void DEV_GPIO_Mode(uint16_t Pin, uint16_t Mode)
{
    gpio_init(Pin);
    if(Mode == 0 || Mode == GPIO_IN) {
        gpio_set_dir(Pin, GPIO_IN);
    } else {
        gpio_set_dir(Pin, GPIO_OUT);
    }
}

/**
 * KEY Config
**/
void DEV_KEY_Config(uint16_t Pin)
{
    gpio_init(Pin);
	  gpio_pull_up(Pin);
    gpio_set_dir(Pin, GPIO_IN);
}

/**
 * delay x ms
**/
void DEV_Delay_ms(UDOUBLE xms)
{
    sleep_ms(xms);
}

void DEV_Delay_us(UDOUBLE xus)
{
    sleep_us(xus);
}

void DEV_GPIO_Init(void)
{
    /* OUTPUT */
    for(int i=0; i<8; i++){
        gpio_init(RELAY1_PIN+i);
        gpio_set_dir(RELAY1_PIN+i, GPIO_OUT);
    }

    /* INPUT */
    for(int i=0; i<8; i++){
        gpio_init(IN1_PIN+i);
        gpio_set_dir(IN1_PIN+i, GPIO_IN);
        gpio_pull_up(IN1_PIN+i);
        gpio_set_irq_enabled(IN1_PIN+i, GPIO_IRQ_EDGE_FALL, true);
        gpio_set_irq_enabled_with_callback(IN1_PIN+i, GPIO_IRQ_EDGE_RISE | GPIO_IRQ_EDGE_FALL, true, gpio_irq_handler);
    }
}

void Beep()
{
    pwm_set_enabled(slice_num, true);
    sleep_ms(100);
    pwm_set_enabled(slice_num, false);
}

/**
 * IRQ
 **/
void DEV_IRQ_SET(uint gpio, uint32_t events, gpio_irq_callback_t callback)
{
    gpio_set_irq_enabled_with_callback(gpio,events,true,callback);
}

/******************************************************************************
function:	Module Initialize, the library and initialize the pins, SPI protocol
parameter:
Info:
******************************************************************************/
uint8_t DEV_Module_Init(void)
{
    Serial.begin(115200);
    sleep_ms(500);
    
    // GPIO Config
    DEV_GPIO_Init();

    // BEEP
    gpio_set_function(BEEP_PIN, GPIO_FUNC_PWM);
    slice_num = pwm_gpio_to_slice_num(BEEP_PIN);
    uint chan = pwm_gpio_to_channel(BEEP_PIN);

    uint32_t sys_clk = clock_get_hz(clk_sys);
    uint32_t frequency = 3276;
    uint32_t div = sys_clk / (frequency * (1149 + 1));
    uint16_t wrap = (sys_clk / (div * frequency)) - 1;

    pwm_set_clkdiv(slice_num, div);
    pwm_set_wrap(slice_num, wrap);
    pwm_set_chan_level(slice_num, chan, wrap / 30);

    Serial.print("DEV_Module_Init OK");
    return 0;
}

/******************************************************************************
function:	Module exits, closes SPI and BCM2835 library
parameter:
Info:
******************************************************************************/
void DEV_Module_Exit(void)
{

}

void gpio_irq_handler(uint gpio, uint32_t events)
{
    static absolute_time_t last_interrupt_time;
    absolute_time_t now = get_absolute_time();
    if (absolute_time_diff_us(last_interrupt_time, now) < 100000) {
        return; // Ignore continuous interrupts within 100ms
    }
    last_interrupt_time = now;

    // Determine the input pin
    if (gpio >= IN1_PIN && gpio <= IN8_PIN) {
        int index = gpio - IN1_PIN;
        uint relayPin = RELAY1_PIN + index;
        
        // Switch the relay state
        if(events & GPIO_IRQ_EDGE_RISE){
            relay_status[index] = 0;
            gpio_put(relayPin, relay_status[index]);
        }else if (events & GPIO_IRQ_EDGE_FALL)
        {
            relay_status[index] = 1;
            gpio_put(relayPin, relay_status[index]);
        }
        
        // Print status information
        Serial.printf("|***  Expansion channel %d %s***|\r\n", index+1, relay_status[index]?"ON":"OFF");
    }
}

