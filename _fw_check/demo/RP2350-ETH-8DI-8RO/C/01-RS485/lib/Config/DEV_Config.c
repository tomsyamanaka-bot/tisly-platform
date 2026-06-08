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

#define SPI_PORT spi1
#define I2C_PORT spi1

uint slice_num;
uint8_t relay_status[8] = {0}; 
void gpio_irq_handler(uint gpio, uint32_t events);

/**
 * GPIO read and write
**/
void DEV_Digital_Write(UWORD Pin, UBYTE Value)
{
    gpio_put(Pin, Value);
}

UBYTE DEV_Digital_Read(UWORD Pin)
{
    return gpio_get(Pin);
}

/**
 * SPI
**/
void DEV_SPI_WriteByte(uint8_t Value)
{
    spi_write_blocking(SPI_PORT, &Value, 1);
}

void DEV_SPI_Write_nByte(uint8_t pData[], uint32_t Len)
{
    spi_write_blocking(SPI_PORT, pData, Len);
}

/**
 * I2C
**/
void DEV_I2C_Write(uint8_t addr, uint8_t reg, uint8_t Value)
{
    uint8_t data[2] = {reg, Value};
    i2c_write_blocking(i2c1, addr, data, 2, false);
}

void DEV_I2C_Write_nByte(uint8_t addr, uint8_t *pData, uint32_t Len)
{
    i2c_write_blocking(i2c1, addr, pData, Len, false);
}

uint8_t DEV_I2C_ReadByte(uint8_t addr, uint8_t reg)
{
    uint8_t buf;
    i2c_write_blocking(i2c1,addr,&reg,1,true);
    i2c_read_blocking(i2c1,addr,&buf,1,false);
    return buf;
}

/**
 * GPIO Mode
**/
void DEV_GPIO_Mode(UWORD Pin, UWORD Mode)
{
    gpio_init(Pin);
    if(Mode == 0 || Mode == GPIO_IN) {
        gpio_set_dir(Pin, GPIO_IN);
    } else {
        gpio_set_dir(Pin, GPIO_OUT);
    }
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
/******************************************************************************
function:	Module Initialize, the library and initialize the pins, SPI protocol
parameter:
Info:
******************************************************************************/
UBYTE DEV_Module_Init(void)
{
    stdio_init_all();
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

    printf("DEV_Module_Init OK \r\n");
    return 0;
}

void DEV_SET_PWM(uint8_t Value){
    if(Value<0 || Value >100){
        printf("DEV_SET_PWM Error \r\n");
    }else {
        pwm_set_chan_level(slice_num, PWM_CHAN_B, Value);
    }
}

void Beep(void)
{
    pwm_set_enabled(slice_num, true);
    sleep_ms(100);
    pwm_set_enabled(slice_num, false);
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
        printf("|***  Expansion channel %d %s***|\r\n", index+1, relay_status[index]?"ON":"OFF");
    }
}
